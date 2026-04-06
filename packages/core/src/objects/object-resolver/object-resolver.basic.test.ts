import { expect, test } from "vitest";
import type { PdfTypeMismatchError } from "../../errors/index";
import { ByteOffset } from "../../types/byte-offset/index";
import { GenerationNumber } from "../../types/generation-number/index";
import { ObjectNumber } from "../../types/object-number/index";
import type { XRefFreeEntry, XRefUsedEntry } from "../../types/pdf-types/index";
import { ObjectResolver } from "./index";
import {
  makeDeps,
  makeRef,
  makeXRefTable,
  unwrapErr,
  unwrapOk,
} from "./object-resolver.test.helpers";

test("create はデフォルト設定で ok を返す", () => {
  const result = ObjectResolver.create(makeDeps());
  expect(result.ok).toBe(true);
});

test("create は deps と config を受け取り ok を返す", () => {
  const result = ObjectResolver.create(makeDeps(), { cacheCapacity: 512 });
  expect(result.ok).toBe(true);
});

test.each([
  0, -1, 0.5, -100,
])("create は不正な cacheCapacity=%d で err を返す", (capacity) => {
  const result = ObjectResolver.create(makeDeps(), {
    cacheCapacity: capacity,
  });
  expect(result.ok).toBe(false);
});

test("create は cacheCapacity 未指定でデフォルト 1024 で生成される", () => {
  const result = ObjectResolver.create(makeDeps());
  expect(result.ok).toBe(true);
});

test("resolve 2回目の結果は1回目と同一である（キャッシュヒット）", async () => {
  const resolver = unwrapOk(
    ObjectResolver.create(makeDeps({ xref: makeXRefTable([]) })),
  );
  const first = await resolver.resolve(makeRef(99));
  const second = await resolver.resolve(makeRef(99));
  expect(first).toEqual(second);
});

test("xref に存在しない ref で resolve すると PdfNull が返る", async () => {
  const resolver = unwrapOk(
    ObjectResolver.create(makeDeps({ xref: makeXRefTable([]) })),
  );
  const resolved = await resolver.resolve(makeRef(999));
  expect(resolved).toEqual({ ok: true, value: { type: "null" } });
});

test("type=0 の XRefFreeEntry で resolve すると PdfNull が返る", async () => {
  const freeEntry: XRefFreeEntry = {
    type: 0,
    nextFreeObject: ObjectNumber.of(0),
    generationNumber: GenerationNumber.of(1),
  };
  const resolver = unwrapOk(
    ObjectResolver.create(makeDeps({ xref: makeXRefTable([[3, freeEntry]]) })),
  );
  const resolved = await resolver.resolve(makeRef(3));
  expect(resolved).toEqual({ ok: true, value: { type: "null" } });
});

test("type=1 の XRefUsedEntry で resolve すると未実装エラーが返る", async () => {
  const usedEntry: XRefUsedEntry = {
    type: 1,
    offset: ByteOffset.of(100),
    generationNumber: GenerationNumber.of(0),
  };
  const resolver = unwrapOk(
    ObjectResolver.create(makeDeps({ xref: makeXRefTable([[7, usedEntry]]) })),
  );
  const resolved = await resolver.resolve(makeRef(7));
  const error = unwrapErr(resolved);
  expect(error.message).toContain("not yet implemented");
});

test("type=1 で generation mismatch の場合は PdfNull が返る", async () => {
  const usedEntry: XRefUsedEntry = {
    type: 1,
    offset: ByteOffset.of(100),
    generationNumber: GenerationNumber.of(2),
  };
  const resolver = unwrapOk(
    ObjectResolver.create(makeDeps({ xref: makeXRefTable([[7, usedEntry]]) })),
  );
  const resolved = await resolver.resolve(makeRef(7, 0));
  expect(resolved).toEqual({ ok: true, value: { type: "null" } });
});

test("resolveAs で期待型 null と一致する場合、その型の PdfObject が返る", async () => {
  const resolver = unwrapOk(
    ObjectResolver.create(makeDeps({ xref: makeXRefTable([]) })),
  );
  const resolved = await resolver.resolveAs(makeRef(1), "null");
  const value = unwrapOk(resolved);
  expect(value.type).toBe("null");
});

test("resolveAs で期待型と不一致の場合、PdfTypeMismatchError が返る", async () => {
  const resolver = unwrapOk(
    ObjectResolver.create(makeDeps({ xref: makeXRefTable([]) })),
  );
  const resolved = await resolver.resolveAs(makeRef(1), "dictionary");
  const error = unwrapErr(resolved) as PdfTypeMismatchError;
  expect(error.code).toBe("TYPE_MISMATCH");
  expect(error.expected).toBe("dictionary");
  expect(error.actual).toBe("null");
});

test("resolve が err を返した場合、resolveAs もそのまま err を返す", async () => {
  const usedEntry: XRefUsedEntry = {
    type: 1,
    offset: ByteOffset.of(100),
    generationNumber: GenerationNumber.of(0),
  };
  const resolver = unwrapOk(
    ObjectResolver.create(makeDeps({ xref: makeXRefTable([[1, usedEntry]]) })),
  );
  const resolved = await resolver.resolveAs(makeRef(1), "dictionary");
  expect(resolved.ok).toBe(false);
});
