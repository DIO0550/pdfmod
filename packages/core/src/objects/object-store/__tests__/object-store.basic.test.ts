import { expect, test, vi } from "vitest";
import type {
  PdfTypeMismatchError,
  PdfWarning,
} from "../../../pdf/errors/index";
import { ByteOffset } from "../../../pdf/types/byte-offset/index";
import { GenerationNumber } from "../../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../../pdf/types/object-number/index";
import type {
  XRefCompressedEntry,
  XRefFreeEntry,
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

test("create はデフォルト設定で ok を返す", () => {
  const result = ObjectStore.create(makeStoreSource());
  expect(result.ok).toBe(true);
});

test("create は source と options を受け取り ok を返す", () => {
  const result = ObjectStore.create(makeStoreSource(), {
    cacheCapacity: 512,
  });
  expect(result.ok).toBe(true);
});

test.each([
  0, -1, 0.5, -100,
])("create は不正な cacheCapacity=%d で err を返す", (capacity) => {
  const result = ObjectStore.create(makeStoreSource(), {
    cacheCapacity: capacity,
  });
  expect(result.ok).toBe(false);
});

test("create は cacheCapacity 未指定でデフォルト 1024 で生成される", () => {
  const result = ObjectStore.create(makeStoreSource());
  expect(result.ok).toBe(true);
});

test("create は streamCacheCapacity 未指定でデフォルト streamCache を生成し ok を返す", () => {
  const result = ObjectStore.create(makeStoreSource());
  expect(result.ok).toBe(true);
});

test.each([
  0, -1, 0.5,
])("create は不正な streamCacheCapacity=%d で err を返す", (capacity) => {
  const result = ObjectStore.create(makeStoreSource(), {
    streamCacheCapacity: capacity,
  });
  expect(result.ok).toBe(false);
});

test("xref に存在しない ref で get すると PdfNull が返る", async () => {
  const store = unwrapOk(
    ObjectStore.create(makeStoreSource({ xref: makeXRefTable([]) })),
  );
  const resolved = await store.get(makeRef(999));
  expect(resolved).toEqual({ ok: true, value: { type: "null" } });
});

test("type=0 の XRefFreeEntry で get すると PdfNull が返る", async () => {
  const freeEntry: XRefFreeEntry = {
    type: 0,
    nextFreeObject: ObjectNumber.of(0),
    generationNumber: GenerationNumber.of(1),
  };
  const store = unwrapOk(
    ObjectStore.create(
      makeStoreSource({ xref: makeXRefTable([[3, freeEntry]]) }),
    ),
  );
  const resolved = await store.get(makeRef(3));
  expect(resolved).toEqual({ ok: true, value: { type: "null" } });
});

test("type=1 の XRefUsedEntry で get するとオブジェクトがパースされ onWarning は呼ばれない", async () => {
  const pdfData = new TextEncoder().encode("7 0 obj\n42\nendobj");
  const usedEntry: XRefUsedEntry = {
    type: 1,
    offset: ByteOffset.of(0),
    generationNumber: GenerationNumber.of(0),
  };
  const seen: PdfWarning[] = [];
  const store = unwrapOk(
    ObjectStore.create(
      makeStoreSource({
        xref: makeXRefTable([[7, usedEntry]]),
        data: pdfData,
      }),
      { onWarning: (w) => seen.push(w) },
    ),
  );
  const resolved = await store.get(makeRef(7));
  const value = unwrapOk(resolved);
  expect(value).toEqual({ type: "integer", value: 42 });
  expect(seen).toHaveLength(0);
});

test("type=1 で generation mismatch の場合 onWarning に GENERATION_MISMATCH が渡る", async () => {
  const usedEntry: XRefUsedEntry = {
    type: 1,
    offset: ByteOffset.of(100),
    generationNumber: GenerationNumber.of(2),
  };
  const seen: PdfWarning[] = [];
  const store = unwrapOk(
    ObjectStore.create(
      makeStoreSource({ xref: makeXRefTable([[7, usedEntry]]) }),
      { onWarning: (w) => seen.push(w) },
    ),
  );
  const resolved = await store.get(makeRef(7, 0));

  expect(resolved).toEqual({ ok: true, value: { type: "null" } });
  expect(seen).toEqual([
    {
      code: "GENERATION_MISMATCH",
      message: "Object 7: generation mismatch (expected 2, got 0)",
      offset: 100,
    },
  ]);
});

test("type=1 で generation mismatch でも onWarning 未指定なら例外にならない", async () => {
  const usedEntry: XRefUsedEntry = {
    type: 1,
    offset: ByteOffset.of(100),
    generationNumber: GenerationNumber.of(2),
  };
  const store = unwrapOk(
    ObjectStore.create(
      makeStoreSource({ xref: makeXRefTable([[7, usedEntry]]) }),
    ),
  );
  const resolved = await store.get(makeRef(7, 0));
  expect(resolved).toEqual({ ok: true, value: { type: "null" } });
});

test("type=1 で generation mismatch の場合、2回目の get では onWarning が再発火しない", async () => {
  const usedEntry: XRefUsedEntry = {
    type: 1,
    offset: ByteOffset.of(100),
    generationNumber: GenerationNumber.of(2),
  };
  const seen: PdfWarning[] = [];
  const store = unwrapOk(
    ObjectStore.create(
      makeStoreSource({ xref: makeXRefTable([[7, usedEntry]]) }),
      { onWarning: (w) => seen.push(w) },
    ),
  );

  await store.get(makeRef(7, 0));
  expect(seen).toHaveLength(1);

  await store.get(makeRef(7, 0));
  expect(seen).toHaveLength(1);
});

test.each([
  {
    entryGen: 1,
    refGen: 0,
    label: "entry世代1・ref世代0（境界値: refが最小値0）",
  },
  {
    entryGen: 0,
    refGen: 1,
    label: "entry世代0・ref世代1（境界値: entryが最小値0）",
  },
  {
    entryGen: 65535,
    refGen: 0,
    label: "entry世代65535・ref世代0（境界値: GenerationNumber許容最大値）",
  },
  {
    entryGen: 5,
    refGen: 3,
    label: "entry世代5・ref世代3（正常系バリエーション: 非ゼロ同士の不一致）",
  },
])("type=1 で世代不一致 $label のとき onWarning に期待/実際の値を含む GENERATION_MISMATCH が渡る", async ({
  entryGen,
  refGen,
}) => {
  const usedEntry: XRefUsedEntry = {
    type: 1,
    offset: ByteOffset.of(100),
    generationNumber: GenerationNumber.of(entryGen),
  };
  const seen: PdfWarning[] = [];
  const store = unwrapOk(
    ObjectStore.create(
      makeStoreSource({ xref: makeXRefTable([[7, usedEntry]]) }),
      { onWarning: (w) => seen.push(w) },
    ),
  );
  const resolved = await store.get(makeRef(7, refGen));

  expect(resolved).toEqual({ ok: true, value: { type: "null" } });
  expect(seen).toEqual([
    {
      code: "GENERATION_MISMATCH",
      message: `Object 7: generation mismatch (expected ${entryGen}, got ${refGen})`,
      offset: 100,
    },
  ]);
});

test("type=1 で obj ヘッダの objNum が xref と不一致の場合エラーが返る", async () => {
  const pdfData = new TextEncoder().encode("99 0 obj\n42\nendobj");
  const usedEntry: XRefUsedEntry = {
    type: 1,
    offset: ByteOffset.of(0),
    generationNumber: GenerationNumber.of(0),
  };
  const store = unwrapOk(
    ObjectStore.create(
      makeStoreSource({
        xref: makeXRefTable([[7, usedEntry]]),
        data: pdfData,
      }),
    ),
  );
  const resolved = await store.get(makeRef(7));
  const error = unwrapErr(resolved);
  expect(error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
  expect(error.message).toContain("mismatch");
});

test("get 2回目はキャッシュヒットし extract が呼ばれない", async () => {
  const entry: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(10),
    indexInStream: 0,
  };
  const store = unwrapOk(
    ObjectStore.create(makeStoreSource({ xref: makeXRefTable([[5, entry]]) })),
  );
  const extractSpy = vi
    .spyOn(ObjectStreamBody, "extract")
    .mockResolvedValue({ ok: true, value: { type: "null" } });

  try {
    await store.get(makeRef(5));
    expect(extractSpy).toHaveBeenCalledTimes(1);

    await store.get(makeRef(5));
    expect(extractSpy).toHaveBeenCalledTimes(1);
  } finally {
    extractSpy.mockRestore();
  }
});

test("getAs で期待型と一致する場合、その型の PdfObject が返る", async () => {
  const store = unwrapOk(
    ObjectStore.create(makeStoreSource({ xref: makeXRefTable([]) })),
  );
  const resolved = await store.getAs(makeRef(1), "null");
  const value = unwrapOk(resolved);
  expect(value.type).toBe("null");
});

test("getAs で期待型と不一致の場合、PdfTypeMismatchError が返る", async () => {
  const store = unwrapOk(
    ObjectStore.create(makeStoreSource({ xref: makeXRefTable([]) })),
  );
  const resolved = await store.getAs(makeRef(1), "dictionary");
  const error = unwrapErr(resolved) as PdfTypeMismatchError;
  expect(error.code).toBe("TYPE_MISMATCH");
  expect(error.expected).toBe("dictionary");
  expect(error.actual).toBe("null");
});

test("get が err を返した場合、getAs もそのまま err を返す", async () => {
  const pdfData = new TextEncoder().encode("99 0 obj\n42\nendobj");
  const usedEntry: XRefUsedEntry = {
    type: 1,
    offset: ByteOffset.of(0),
    generationNumber: GenerationNumber.of(0),
  };
  const store = unwrapOk(
    ObjectStore.create(
      makeStoreSource({
        xref: makeXRefTable([[1, usedEntry]]),
        data: pdfData,
      }),
    ),
  );

  const getResult = await store.get(makeRef(1));
  const getError = unwrapErr(getResult);
  expect(getError.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");

  const getAsResult = await store.getAs(makeRef(1), "dictionary");
  const getAsError = unwrapErr(getAsResult);
  expect(getAsError).toEqual(getError);
});
