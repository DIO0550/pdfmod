import { expect, test, vi } from "vitest";
import type { PdfCircularReferenceError } from "../../errors/index";
import { ObjectNumber } from "../../types/object-number/index";
import type { XRefCompressedEntry } from "../../types/pdf-types/index";
import { ObjectStreamBody } from "../object-stream-extractor/index";
import { ObjectStore } from "./index";
import {
  makeRef,
  makeStoreSource,
  makeXRefTable,
  unwrapErr,
  unwrapOk,
} from "./object-store.test.helpers";

test("キャッシュ容量1で2つの異なる ref を get すると1つ目が evict される", async () => {
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
  const store = unwrapOk(
    ObjectStore.create(
      makeStoreSource({
        xref: makeXRefTable([
          [1, compressedEntry1],
          [2, compressedEntry2],
        ]),
      }),
      { cacheCapacity: 1 },
    ),
  );
  const extractSpy = vi
    .spyOn(ObjectStreamBody, "extract")
    .mockResolvedValue({ ok: true, value: { type: "null" } });

  try {
    const first = await store.get(makeRef(1));
    expect(unwrapOk(first).type).toBe("null");
    expect(extractSpy).toHaveBeenCalledTimes(1);

    const firstAgain = await store.get(makeRef(1));
    expect(unwrapOk(firstAgain).type).toBe("null");
    expect(extractSpy).toHaveBeenCalledTimes(1);

    const second = await store.get(makeRef(2));
    expect(unwrapOk(second).type).toBe("null");
    expect(extractSpy).toHaveBeenCalledTimes(2);

    const firstAfterEvict = await store.get(makeRef(1));
    expect(unwrapOk(firstAfterEvict).type).toBe("null");
    expect(extractSpy).toHaveBeenCalledTimes(3);
  } finally {
    extractSpy.mockRestore();
  }
});

test("xref.entries が空テーブルの場合、すべての ref で PdfNull が返る", async () => {
  const store = unwrapOk(
    ObjectStore.create(makeStoreSource({ xref: makeXRefTable([]) })),
  );
  const results = await Promise.all([
    store.get(makeRef(1)),
    store.get(makeRef(2)),
    store.get(makeRef(100)),
  ]);
  for (const r of results) {
    expect(r).toEqual({ ok: true, value: { type: "null" } });
  }
});

test("同一 ref の並行 get 呼び出し（Promise.all）で循環参照を誤検出しない", async () => {
  const store = unwrapOk(
    ObjectStore.create(makeStoreSource({ xref: makeXRefTable([]) })),
  );
  const ref = makeRef(42);
  const results = await Promise.all([
    store.get(ref),
    store.get(ref),
    store.get(ref),
  ]);
  for (const r of results) {
    expect(r).toEqual({ ok: true, value: { type: "null" } });
  }
});

test("in-flight 中に別チェーンから同一 ref を経由しても既存 Promise が返る（behavioral parity）", async () => {
  const entryA: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(20),
    indexInStream: 0,
  };
  const entryB: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(20),
    indexInStream: 1,
  };
  const store = unwrapOk(
    ObjectStore.create(
      makeStoreSource({
        xref: makeXRefTable([
          [1, entryA],
          [2, entryB],
        ]),
      }),
    ),
  );
  const extractSpy = vi
    .spyOn(ObjectStreamBody, "extract")
    .mockResolvedValue({ ok: true, value: { type: "boolean", value: true } });

  try {
    const [resultA, resultB] = await Promise.all([
      store.get(makeRef(1)),
      store.get(makeRef(2)),
    ]);
    expect(unwrapOk(resultA)).toEqual({ type: "boolean", value: true });
    expect(unwrapOk(resultB)).toEqual({ type: "boolean", value: true });
  } finally {
    extractSpy.mockRestore();
  }
});

test("type=2 で ObjectStreamBody.extract が呼ばれる（親 ObjStm は xref 未登録のため err）", async () => {
  const entry: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(10),
    indexInStream: 0,
  };
  const store = unwrapOk(
    ObjectStore.create(makeStoreSource({ xref: makeXRefTable([[5, entry]]) })),
  );

  const result = await store.get(makeRef(5));
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_STREAM_INVALID");
});

test("type=2 で generation !== 0 の場合は PdfNull が返る", async () => {
  const entry: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(10),
    indexInStream: 0,
  };
  const store = unwrapOk(
    ObjectStore.create(makeStoreSource({ xref: makeXRefTable([[5, entry]]) })),
  );
  const resolved = await store.get(makeRef(5, 3));
  expect(resolved).toEqual({ ok: true, value: { type: "null" } });
});

test("type=2 で ObjectStreamBody.extract に正しい引数が渡される", async () => {
  const entry: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(10),
    indexInStream: 3,
  };
  const store = unwrapOk(
    ObjectStore.create(makeStoreSource({ xref: makeXRefTable([[5, entry]]) })),
  );

  const spy = vi.spyOn(ObjectStreamBody, "extract");
  try {
    await store.get(makeRef(5));

    expect(spy).toHaveBeenCalledOnce();
    const args = spy.mock.calls[0];
    expect(args[2]).toBe(ObjectNumber.of(5));
    expect(args[3]).toBe(ObjectNumber.of(10));
    expect(args[4]).toBe(3);
  } finally {
    spy.mockRestore();
  }
});

test("type=2 自己参照（streamObject === 自身）で CIRCULAR_REFERENCE が返る", async () => {
  const entry: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(5),
    indexInStream: 0,
  };
  const store = unwrapOk(
    ObjectStore.create(makeStoreSource({ xref: makeXRefTable([[5, entry]]) })),
  );

  const result = await store.get(makeRef(5));
  const error = unwrapErr(result) as PdfCircularReferenceError;
  expect(error.code).toBe("CIRCULAR_REFERENCE");
});

test("streamCacheCapacity: false でも type=2 のオブジェクトを正常に解決できる", async () => {
  const entry: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(10),
    indexInStream: 0,
  };
  const store = unwrapOk(
    ObjectStore.create(makeStoreSource({ xref: makeXRefTable([[5, entry]]) }), {
      streamCacheCapacity: false,
    }),
  );
  const extractSpy = vi
    .spyOn(ObjectStreamBody, "extract")
    .mockResolvedValue({ ok: true, value: { type: "integer", value: 42 } });

  try {
    const result = await store.get(makeRef(5));
    expect(unwrapOk(result)).toEqual({ type: "integer", value: 42 });

    const args = extractSpy.mock.calls[0];
    expect(args[1]).toBeUndefined();
  } finally {
    extractSpy.mockRestore();
  }
});
