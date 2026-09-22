import { expect, test, vi } from "vitest";
import type { PdfCircularReferenceError } from "../../../pdf/errors/index";
import { ByteOffset } from "../../../pdf/types/byte-offset/index";
import { GenerationNumber } from "../../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../../pdf/types/object-number/index";
import type {
  XRefCompressedEntry,
  XRefUsedEntry,
} from "../../../pdf/types/pdf-types/index";
import { ObjectStreamBody } from "../../object-stream-extractor/index";
import { ObjectStore } from "../index";
import {
  makeRef,
  makeStoreSource,
  makeXRefTable,
  unwrapErr,
  unwrapOk,
} from "./object-store.test.helpers";

const makeDummyStreamData = (objNum: number): Uint8Array => {
  const body = "1 0 2 5 null null";
  return new TextEncoder().encode(
    `${objNum} 0 obj\n<< /Type /ObjStm /N 2 /First 8 /Length ${body.length} >>\nstream\n${body}\nendstream\nendobj`,
  );
};

const makeStreamEntry = (): XRefUsedEntry => ({
  type: 1,
  offset: ByteOffset.of(0),
  generationNumber: GenerationNumber.of(0),
});

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
          [10, makeStreamEntry()],
          [1, compressedEntry1],
          [2, compressedEntry2],
        ]),
        data: makeDummyStreamData(10),
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
          [20, makeStreamEntry()],
          [1, entryA],
          [2, entryB],
        ]),
        data: makeDummyStreamData(20),
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

test("type=2 で親 ObjStm が xref 未登録（null解決）の場合に OBJECT_STREAM_INVALID が返る", async () => {
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

test("type=2 で親 ObjStm が辞書等（非stream）の場合に OBJECT_STREAM_INVALID が返る", async () => {
  const dictData = new TextEncoder().encode(
    "10 0 obj\n<< /Type /ObjStm >>\nendobj",
  );
  const dictEntry: XRefUsedEntry = {
    type: 1,
    offset: ByteOffset.of(0),
    generationNumber: GenerationNumber.of(0),
  };
  const entry: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(10),
    indexInStream: 0,
  };
  const store = unwrapOk(
    ObjectStore.create(
      makeStoreSource({
        xref: makeXRefTable([
          [10, dictEntry],
          [5, entry],
        ]),
        data: dictData,
      }),
    ),
  );

  const result = await store.get(makeRef(5));
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_STREAM_INVALID");
});

test("type=2 で親 ObjStm 解決自体がエラーの場合にそのエラーを伝播する", async () => {
  const brokenData = new TextEncoder().encode("10 0 obj\n[broken\nendobj");
  const usedEntry: XRefUsedEntry = {
    type: 1,
    offset: ByteOffset.of(0),
    generationNumber: GenerationNumber.of(0),
  };
  const entry: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(10),
    indexInStream: 0,
  };
  const store = unwrapOk(
    ObjectStore.create(
      makeStoreSource({
        xref: makeXRefTable([
          [10, usedEntry],
          [5, entry],
        ]),
        data: brokenData,
      }),
    ),
  );

  const result = await store.get(makeRef(5));
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
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

test("type=2 で indexInStream が負数の場合に親ストリーム解決前に OBJECT_STREAM_INVALID が返る", async () => {
  const entry: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(10),
    indexInStream: -1,
  };
  const store = unwrapOk(
    ObjectStore.create(makeStoreSource({ xref: makeXRefTable([[5, entry]]) })),
  );
  const result = await store.get(makeRef(5));
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_STREAM_INVALID");
  expect(error.message).toContain(
    "indexInStream must be a non-negative safe integer",
  );
});

test("type=2 で indexInStream が小数の場合に親ストリーム解決前に OBJECT_STREAM_INVALID が返る", async () => {
  const entry: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(10),
    indexInStream: 0.5,
  };
  const store = unwrapOk(
    ObjectStore.create(makeStoreSource({ xref: makeXRefTable([[5, entry]]) })),
  );
  const result = await store.get(makeRef(5));
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_STREAM_INVALID");
  expect(error.message).toContain(
    "indexInStream must be a non-negative safe integer",
  );
});

test("type=2 で ObjectStreamBody.extract に正しい引数が渡される", async () => {
  const entry: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(10),
    indexInStream: 3,
  };
  const store = unwrapOk(
    ObjectStore.create(
      makeStoreSource({
        xref: makeXRefTable([
          [10, makeStreamEntry()],
          [5, entry],
        ]),
        data: makeDummyStreamData(10),
      }),
    ),
  );

  const spy = vi
    .spyOn(ObjectStreamBody, "extract")
    .mockResolvedValue({ ok: true, value: { type: "null" } });
  try {
    await store.get(makeRef(5));

    expect(spy).toHaveBeenCalledOnce();
    const options = spy.mock.calls[0][0];
    expect(options.stream.type).toBe("stream");
    expect(options.targetObjNum).toBe(ObjectNumber.of(5));
    expect(options.streamObjNum).toBe(ObjectNumber.of(10));
    expect(options.indexInStream).toBe(3);
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
    ObjectStore.create(
      makeStoreSource({
        xref: makeXRefTable([
          [10, makeStreamEntry()],
          [5, entry],
        ]),
        data: makeDummyStreamData(10),
      }),
      {
        streamCacheCapacity: false,
      },
    ),
  );
  const extractSpy = vi
    .spyOn(ObjectStreamBody, "extract")
    .mockResolvedValue({ ok: true, value: { type: "integer", value: 42 } });

  try {
    const result = await store.get(makeRef(5));
    expect(unwrapOk(result)).toEqual({ type: "integer", value: 42 });

    const options = extractSpy.mock.calls[0][0];
    expect(options.cache).toBeUndefined();
  } finally {
    extractSpy.mockRestore();
  }
});
