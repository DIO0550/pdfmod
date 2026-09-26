import { expect, type MockInstance, test, vi } from "vitest";
import type { PdfError } from "../../../pdf/errors/index";
import { ByteOffset } from "../../../pdf/types/byte-offset/index";
import { GenerationNumber } from "../../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../../pdf/types/object-number/index";
import type {
  PdfValue,
  XRefUsedEntry,
} from "../../../pdf/types/pdf-types/index";
import type { ResolveRef } from "../../../pdf/types/resolve-ref/index";
import type { Result } from "../../../utils/result/index";
import { err, map, ok } from "../../../utils/result/index";
import { ObjectParser } from "../../object-parser/index";
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

/** 偽の間接オブジェクトパース 1 件分の振る舞い。 */
type ParseBehavior = (
  resolver: ResolveRef | undefined,
) => Promise<Result<PdfValue, PdfError>>;

/**
 * 参照先を解決してから自分の値を返す振る舞いを作る。
 *
 * @param target - 参照先のオブジェクト番号
 * @param value - 参照先の解決に成功した場合に自分が返す値
 * @returns ParseBehavior
 */
const refersTo =
  (target: number, value: PdfValue): ParseBehavior =>
  async (resolver) => {
    if (resolver === undefined) {
      return ok(value);
    }
    // 各チェーンが in-flight 登録を終えてから参照に入るよう 1 tick 譲る。
    // 同期的に再帰すると 1 本のチェーンに畳まれ、既存の ancestors 検出に捕まってしまう
    await Promise.resolve();
    return map(
      await resolver({
        objectNumber: ObjectNumber.of(target),
        generationNumber: GenerationNumber.of(0),
      }),
      () => value,
    );
  };

/**
 * 参照を持たず固定値を返す振る舞いを作る。
 *
 * @param value - 返す値
 * @returns ParseBehavior
 */
const yieldsValue =
  (value: PdfValue): ParseBehavior =>
  async () =>
    ok(value);

/**
 * 参照を持たず固定エラーを返す振る舞いを作る。
 *
 * @param error - 返すエラー
 * @returns ParseBehavior
 */
const failsWith =
  (error: PdfError): ParseBehavior =>
  async () =>
    err(error);

/** ObjectParser.parseIndirectObject を差し替えたスパイ。 */
type ParseSpy = MockInstance<typeof ObjectParser.parseIndirectObject>;

/**
 * オブジェクト番号ごとの振る舞いを持つ偽の間接オブジェクトパースをセットアップする。
 * behaviors は呼び出しのたびに参照されるため、途中で差し替えられる。
 *
 * @param behaviors - オブジェクト番号 → 振る舞い
 * @returns ObjectParser.parseIndirectObject のスパイ
 */
const spyParse = (behaviors: ReadonlyMap<number, ParseBehavior>): ParseSpy =>
  vi
    .spyOn(ObjectParser, "parseIndirectObject")
    .mockImplementation(async (_data, offset, resolver) => {
      const objNum = offset as number;
      const behavior = behaviors.get(objNum) ?? yieldsValue({ type: "null" });
      const result = await behavior(resolver);
      if (!result.ok) {
        return result;
      }
      return ok({
        objectNumber: ObjectNumber.of(objNum),
        generationNumber: GenerationNumber.of(0),
        body: result.value,
      });
    });

/**
 * type=1 エントリを生成する。offset にオブジェクト番号を格納する。
 *
 * @param objNum - オブジェクト番号
 * @returns XRefUsedEntry
 */
const used = (objNum: number): XRefUsedEntry => ({
  type: 1,
  offset: ByteOffset.of(objNum),
  generationNumber: GenerationNumber.of(0),
});

/**
 * 指定オブジェクトを type=1 エントリとして登録したストアを作る。
 *
 * @param objNumbers - 登録するオブジェクト番号
 * @returns ObjectStore
 */
const makeStore = (objNumbers: readonly number[]): ObjectStore =>
  unwrapOk(
    ObjectStore.create(
      makeStoreSource({
        xref: makeXRefTable(objNumbers.map((n) => [n, used(n)] as const)),
      }),
    ),
  );

/**
 * スパイのうち指定オブジェクト番号を対象とした呼び出し回数を数える。
 *
 * @param spy - spyParse が返したスパイ
 * @param objNumber - 対象のオブジェクト番号
 * @returns 呼び出し回数
 */
const callsFor = (spy: ParseSpy, objNumber: number): number =>
  spy.mock.calls.filter(([, offset]) => (offset as number) === objNumber)
    .length;

test("閉路のない並行解決で共通の子オブジェクトの読み取りが 1 回に集約される", async () => {
  const store = makeStore([1, 2, 3]);
  const parseSpy = spyParse(
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
    expect(callsFor(parseSpy, 3)).toBe(1);
  } finally {
    parseSpy.mockRestore();
  }
});

test("相互参照する 2 オブジェクトの並行 get はハングせず CIRCULAR_REFERENCE を返す", async () => {
  const store = makeStore([1, 2]);
  const parseSpy = spyParse(
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
    parseSpy.mockRestore();
  }
});

test("3 者循環（1→2→3→1）の並行 get はハングせず CIRCULAR_REFERENCE を返す", async () => {
  const store = makeStore([1, 2, 3]);
  const parseSpy = spyParse(
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
    parseSpy.mockRestore();
  }
});

test("待たれている側の解決失敗は循環参照に置き換えられずそのまま伝わる", async () => {
  const store = makeStore([1, 2, 3]);
  const parseSpy = spyParse(
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
    parseSpy.mockRestore();
  }
});

test("循環検出の後に待った側・検出した側のどちらを get し直しても再解決される", async () => {
  const store = makeStore([1, 2]);
  const behaviors = new Map([
    [1, refersTo(2, FIVE)],
    [2, refersTo(1, FIVE)],
  ]);
  const parseSpy = spyParse(behaviors);

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
    parseSpy.mockRestore();
  }
});

test("先行チェーンの完了後に同じ子オブジェクトを待っても閉路と判定されない", async () => {
  const store = makeStore([1, 2, 3]);
  const parseSpy = spyParse(
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
    parseSpy.mockRestore();
  }
});

test("循環以外のエラーが伝播した後も再 get で再解決される", async () => {
  const store = makeStore([1, 2, 3]);
  const behaviors = new Map([
    [1, refersTo(3, FIVE)],
    [2, refersTo(3, FIVE)],
    [3, failsWith(READ_FAILURE)],
  ]);
  const parseSpy = spyParse(behaviors);

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
    parseSpy.mockRestore();
  }
});
