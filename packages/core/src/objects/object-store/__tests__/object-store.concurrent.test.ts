import { expect, type MockInstance, test, vi } from "vitest";
import type { PdfError } from "../../../pdf/errors/index";
import { ObjectNumber } from "../../../pdf/types/object-number/index";
import type {
  PdfValue,
  XRefCompressedEntry,
} from "../../../pdf/types/pdf-types/index";
import type { Result } from "../../../utils/result/index";
import { err, map, ok } from "../../../utils/result/index";
import type { StreamResolver } from "../../object-stream-extractor/index";
import { ObjectStreamBody } from "../../object-stream-extractor/index";
import { ObjectStore } from "../index";
import {
  makeRef,
  makeStoreSource,
  makeXRefTable,
  unwrapErr,
  unwrapOk,
} from "./object-store.test.helpers";

const FIVE: PdfValue = { type: "integer", value: 5 };
const FORTY_TWO: PdfValue = { type: "integer", value: 42 };
const READ_FAILURE: PdfError = {
  code: "OBJECT_STREAM_INVALID",
  message: "fake read failure",
};

/** 偽の ObjStm 抽出 1 件分の振る舞い。 */
type ExtractBehavior = (
  resolver: StreamResolver,
) => Promise<Result<PdfValue, PdfError>>;

/**
 * 参照先を解決してから自分の値を返す振る舞いを作る。
 *
 * @param target - 参照先のオブジェクト番号
 * @param value - 参照先の解決に成功した場合に自分が返す値
 * @returns ExtractBehavior
 */
const refersTo =
  (target: number, value: PdfValue): ExtractBehavior =>
  async (resolver) => {
    // 各チェーンが in-flight 登録を終えてから参照に入るよう 1 tick 譲る。
    // 同期的に再帰すると 1 本のチェーンに畳まれ、既存の ancestors 検出に捕まってしまう
    await Promise.resolve();
    return map(await resolver.resolve(ObjectNumber.of(target)), () => value);
  };

/**
 * 参照を持たず固定値を返す振る舞いを作る。
 *
 * @param value - 返す値
 * @returns ExtractBehavior
 */
const yieldsValue =
  (value: PdfValue): ExtractBehavior =>
  async () =>
    ok(value);

/**
 * 参照を持たず固定エラーを返す振る舞いを作る。
 *
 * @param error - 返すエラー
 * @returns ExtractBehavior
 */
const failsWith =
  (error: PdfError): ExtractBehavior =>
  async () =>
    err(error);

/** ObjectStreamBody.extract を差し替えたスパイ。 */
type ExtractSpy = MockInstance<typeof ObjectStreamBody.extract>;

/**
 * オブジェクト番号ごとの振る舞いを持つ偽の ObjStm 抽出をセットアップする。
 * behaviors は呼び出しのたびに参照されるため、途中で差し替えられる。
 *
 * @param behaviors - オブジェクト番号 → 振る舞い
 * @returns ObjectStreamBody.extract のスパイ
 */
const spyExtract = (
  behaviors: ReadonlyMap<number, ExtractBehavior>,
): ExtractSpy =>
  vi
    .spyOn(ObjectStreamBody, "extract")
    .mockImplementation(async (resolver, _cache, targetObjNum) =>
      (behaviors.get(targetObjNum) ?? yieldsValue({ type: "null" }))(resolver),
    );

/**
 * type=2 エントリを生成する。
 *
 * @param streamObject - 格納元 ObjStm のオブジェクト番号
 * @returns XRefCompressedEntry
 */
const compressed = (streamObject: number): XRefCompressedEntry => ({
  type: 2,
  streamObject: ObjectNumber.of(streamObject),
  indexInStream: 0,
});

/**
 * 指定オブジェクトをそれぞれ別 ObjStm の type=2 エントリとして登録したストアを作る。
 *
 * @param objNumbers - 登録するオブジェクト番号
 * @returns ObjectStore
 */
const makeStore = (objNumbers: readonly number[]): ObjectStore =>
  unwrapOk(
    ObjectStore.create(
      makeStoreSource({
        xref: makeXRefTable(
          objNumbers.map((n) => [n, compressed(n + 100)] as const),
        ),
      }),
    ),
  );

/**
 * スパイのうち指定オブジェクト番号を対象とした呼び出し回数を数える。
 *
 * @param spy - spyExtract が返したスパイ
 * @param objNumber - 対象のオブジェクト番号
 * @returns 呼び出し回数
 */
const callsFor = (spy: ExtractSpy, objNumber: number): number =>
  spy.mock.calls.filter(([, , targetObjNum]) => targetObjNum === objNumber)
    .length;

test("閉路のない並行解決で共通の子オブジェクトの読み取りが 1 回に集約される", async () => {
  const store = makeStore([1, 2, 3]);
  const extractSpy = spyExtract(
    new Map([
      [1, refersTo(3, FORTY_TWO)],
      [2, refersTo(3, FORTY_TWO)],
      [3, yieldsValue(FORTY_TWO)],
    ]),
  );

  try {
    const results = await Promise.all([
      store.get(makeRef(1)),
      store.get(makeRef(2)),
    ]);
    expect(results.map((r) => unwrapOk(r))).toEqual([FORTY_TWO, FORTY_TWO]);
    expect(callsFor(extractSpy, 3)).toBe(1);
  } finally {
    extractSpy.mockRestore();
  }
});

test("相互参照する 2 オブジェクトの並行 get はハングせず CIRCULAR_REFERENCE を返す", async () => {
  const store = makeStore([1, 2]);
  const extractSpy = spyExtract(
    new Map([
      [1, refersTo(2, FIVE)],
      [2, refersTo(1, FIVE)],
    ]),
  );

  try {
    const results = await Promise.all([
      store.get(makeRef(1)),
      store.get(makeRef(2)),
    ]);
    expect(results.map((r) => unwrapErr(r).code)).toEqual([
      "CIRCULAR_REFERENCE",
      "CIRCULAR_REFERENCE",
    ]);
  } finally {
    extractSpy.mockRestore();
  }
});

test("3 者循環（1→2→3→1）の並行 get はハングせず CIRCULAR_REFERENCE を返す", async () => {
  const store = makeStore([1, 2, 3]);
  const extractSpy = spyExtract(
    new Map([
      [1, refersTo(2, FIVE)],
      [2, refersTo(3, FIVE)],
      [3, refersTo(1, FIVE)],
    ]),
  );

  try {
    const results = await Promise.all([
      store.get(makeRef(1)),
      store.get(makeRef(2)),
      store.get(makeRef(3)),
    ]);
    expect(results.map((r) => unwrapErr(r).code)).toEqual([
      "CIRCULAR_REFERENCE",
      "CIRCULAR_REFERENCE",
      "CIRCULAR_REFERENCE",
    ]);
  } finally {
    extractSpy.mockRestore();
  }
});

test("待たれている側の解決失敗は循環参照に置き換えられずそのまま伝わる", async () => {
  const store = makeStore([1, 2, 3]);
  const extractSpy = spyExtract(
    new Map([
      [1, refersTo(3, FIVE)],
      [2, refersTo(3, FIVE)],
      [3, failsWith(READ_FAILURE)],
    ]),
  );

  try {
    const results = await Promise.all([
      store.get(makeRef(1)),
      store.get(makeRef(2)),
    ]);
    expect(results.map((r) => unwrapErr(r).code)).toEqual([
      "OBJECT_STREAM_INVALID",
      "OBJECT_STREAM_INVALID",
    ]);
  } finally {
    extractSpy.mockRestore();
  }
});

test("循環検出の後に待った側・検出した側のどちらを get し直しても再解決される", async () => {
  const store = makeStore([1, 2]);
  const behaviors = new Map([
    [1, refersTo(2, FIVE)],
    [2, refersTo(1, FIVE)],
  ]);
  const extractSpy = spyExtract(behaviors);

  try {
    const circular = await Promise.all([
      store.get(makeRef(1)),
      store.get(makeRef(2)),
    ]);
    expect(circular.map((r) => unwrapErr(r).code)).toEqual([
      "CIRCULAR_REFERENCE",
      "CIRCULAR_REFERENCE",
    ]);

    behaviors.set(1, yieldsValue(FIVE));
    behaviors.set(2, yieldsValue(FIVE));
    expect(unwrapOk(await store.get(makeRef(1)))).toEqual(FIVE);
    expect(unwrapOk(await store.get(makeRef(2)))).toEqual(FIVE);
  } finally {
    extractSpy.mockRestore();
  }
});

test("先行チェーンの完了後に同じ子オブジェクトを待っても閉路と判定されない", async () => {
  const store = makeStore([1, 2, 3]);
  const extractSpy = spyExtract(
    new Map([
      [1, refersTo(3, FIVE)],
      [2, refersTo(3, FIVE)],
      [3, yieldsValue(FORTY_TWO)],
    ]),
  );

  try {
    expect(unwrapOk(await store.get(makeRef(1)))).toEqual(FIVE);
    expect(unwrapOk(await store.get(makeRef(2)))).toEqual(FIVE);
  } finally {
    extractSpy.mockRestore();
  }
});

test("循環以外のエラーが伝播した後も再 get で再解決される", async () => {
  const store = makeStore([1, 2, 3]);
  const behaviors = new Map([
    [1, refersTo(3, FIVE)],
    [2, refersTo(3, FIVE)],
    [3, failsWith(READ_FAILURE)],
  ]);
  const extractSpy = spyExtract(behaviors);

  try {
    const failed = await Promise.all([
      store.get(makeRef(1)),
      store.get(makeRef(2)),
    ]);
    expect(failed.map((r) => unwrapErr(r).code)).toEqual([
      "OBJECT_STREAM_INVALID",
      "OBJECT_STREAM_INVALID",
    ]);

    behaviors.set(3, yieldsValue(FIVE));
    expect(unwrapOk(await store.get(makeRef(1)))).toEqual(FIVE);
    expect(unwrapOk(await store.get(makeRef(3)))).toEqual(FIVE);
  } finally {
    extractSpy.mockRestore();
  }
});
