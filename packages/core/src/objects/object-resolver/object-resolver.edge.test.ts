import { expect, test, vi } from "vitest";
import type { PdfCircularReferenceError } from "../../errors/index";
import { ObjectNumber } from "../../types/object-number/index";
import type { XRefCompressedEntry } from "../../types/pdf-types/index";
import { ObjectStreamBody } from "../object-stream-extractor/index";
import { ObjectResolver } from "./index";
import {
  makeDeps,
  makeRef,
  makeStreamExtractDeps,
  makeXRefTable,
  unwrapErr,
  unwrapOk,
} from "./object-resolver.test.helpers";

test("キャッシュ容量1で2つの異なる ref を resolve すると1つ目が evict される", async () => {
  const compressedEntry1: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(10),
    indexInStream: 0,
  };
  const compressedEntry2: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(10),
    indexInStream: 1,
  };
  const streamDeps = makeStreamExtractDeps({});
  const resolver = unwrapOk(
    ObjectResolver.create(
      makeDeps({
        xref: makeXRefTable([
          [1, compressedEntry1],
          [2, compressedEntry2],
        ]),
      }),
      { cacheCapacity: 1 },
      streamDeps,
    ),
  );
  const extractSpy = vi
    .spyOn(ObjectStreamBody, "extract")
    .mockResolvedValue({ ok: true, value: { type: "null" } });

  try {
    const first = await resolver.resolve(makeRef(1));
    expect(unwrapOk(first).type).toBe("null");
    expect(extractSpy).toHaveBeenCalledTimes(1);

    const firstAgain = await resolver.resolve(makeRef(1));
    expect(unwrapOk(firstAgain).type).toBe("null");
    expect(extractSpy).toHaveBeenCalledTimes(1);

    const second = await resolver.resolve(makeRef(2));
    expect(unwrapOk(second).type).toBe("null");
    expect(extractSpy).toHaveBeenCalledTimes(2);

    const firstAfterEvict = await resolver.resolve(makeRef(1));
    expect(unwrapOk(firstAfterEvict).type).toBe("null");
    expect(extractSpy).toHaveBeenCalledTimes(3);
  } finally {
    extractSpy.mockRestore();
  }
});

test("xref.entries が空テーブルの場合、すべての ref で PdfNull が返る", async () => {
  const resolver = unwrapOk(
    ObjectResolver.create(makeDeps({ xref: makeXRefTable([]) })),
  );
  const results = await Promise.all([
    resolver.resolve(makeRef(1)),
    resolver.resolve(makeRef(2)),
    resolver.resolve(makeRef(100)),
  ]);
  results.forEach((r) => {
    expect(r).toEqual({ ok: true, value: { type: "null" } });
  });
});

test("同一 ref の並行 resolve 呼び出し（Promise.all）で循環参照を誤検出しない", async () => {
  const resolver = unwrapOk(
    ObjectResolver.create(makeDeps({ xref: makeXRefTable([]) })),
  );
  const ref = makeRef(42);
  const results = await Promise.all([
    resolver.resolve(ref),
    resolver.resolve(ref),
    resolver.resolve(ref),
  ]);
  results.forEach((r) => {
    expect(r).toEqual({ ok: true, value: { type: "null" } });
  });
});

test("type=2 で ObjectStreamBody.extract が呼ばれる（親 ObjStm は xref 未登録のため err）", async () => {
  const entry: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(10),
    indexInStream: 0,
  };
  const streamDeps = makeStreamExtractDeps({});
  const deps = makeDeps({ xref: makeXRefTable([[5, entry]]) });
  const resolver = unwrapOk(ObjectResolver.create(deps, undefined, streamDeps));

  const result = await resolver.resolve(makeRef(5));
  // streamObjNum=10 は xref 未登録 → null が返る → extract 内で型不一致エラー
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_STREAM_INVALID");
});

test("type=2 で generation !== 0 の場合は PdfNull が返る", async () => {
  const entry: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(10),
    indexInStream: 0,
  };
  const deps = makeDeps({ xref: makeXRefTable([[5, entry]]) });
  const resolver = unwrapOk(ObjectResolver.create(deps));
  const resolved = await resolver.resolve(makeRef(5, 3));
  expect(resolved).toEqual({ ok: true, value: { type: "null" } });
});

test("type=2 自己参照（streamObject === 自身）で CIRCULAR_REFERENCE が返る", async () => {
  const entry: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(5),
    indexInStream: 0,
  };
  const streamDeps = makeStreamExtractDeps({});
  const deps = makeDeps({ xref: makeXRefTable([[5, entry]]) });
  const resolver = unwrapOk(ObjectResolver.create(deps, undefined, streamDeps));

  const result = await resolver.resolve(makeRef(5));
  const error = unwrapErr(result) as PdfCircularReferenceError;
  expect(error.code).toBe("CIRCULAR_REFERENCE");
});

test("type=2 で ObjectStreamBody.extract に正しい引数が渡される", async () => {
  const entry: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(10),
    indexInStream: 3,
  };
  const streamDeps = makeStreamExtractDeps({});
  const deps = makeDeps({ xref: makeXRefTable([[5, entry]]) });
  const resolver = unwrapOk(ObjectResolver.create(deps, undefined, streamDeps));

  const spy = vi.spyOn(ObjectStreamBody, "extract");
  await resolver.resolve(makeRef(5));

  expect(spy).toHaveBeenCalledOnce();
  const args = spy.mock.calls[0];
  expect(args[2]).toBe(ObjectNumber.of(5));
  expect(args[3]).toBe(ObjectNumber.of(10));
  expect(args[4]).toBe(3);
  spy.mockRestore();
});
