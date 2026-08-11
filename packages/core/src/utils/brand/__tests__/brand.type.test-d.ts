// packages/core/src/utils/brand/__tests__/brand.type.test-d.ts

import { expectTypeOf, test } from "vitest";
import type { ByteOffset } from "../../../pdf/types/byte-offset/index";
import type { GenerationNumber } from "../../../pdf/types/generation-number/index";
import type { ObjectNumber } from "../../../pdf/types/object-number/index";
import type { Brand } from "../index";

declare const TestBrand: unique symbol;

test("Brand<T, B> はベース型 T を拡張し T からは代入できない", () => {
  expectTypeOf<Brand<number, typeof TestBrand>>().toExtend<number>();
  expectTypeOf<number>().not.toExtend<Brand<number, typeof TestBrand>>();
});

test("素の number は3つの Brand 型のいずれにも代入できない", () => {
  expectTypeOf<number>().not.toExtend<ObjectNumber>();
  expectTypeOf<number>().not.toExtend<GenerationNumber>();
  expectTypeOf<number>().not.toExtend<ByteOffset>();
});

test("ObjectNumber は GenerationNumber / ByteOffset に代入できない", () => {
  expectTypeOf<ObjectNumber>().not.toExtend<GenerationNumber>();
  expectTypeOf<ObjectNumber>().not.toExtend<ByteOffset>();
});

test("GenerationNumber は ObjectNumber / ByteOffset に代入できない", () => {
  expectTypeOf<GenerationNumber>().not.toExtend<ObjectNumber>();
  expectTypeOf<GenerationNumber>().not.toExtend<ByteOffset>();
});

test("ByteOffset は ObjectNumber / GenerationNumber に代入できない", () => {
  expectTypeOf<ByteOffset>().not.toExtend<ObjectNumber>();
  expectTypeOf<ByteOffset>().not.toExtend<GenerationNumber>();
});

test("各 Brand 型は number へ代入でき算術演算に使える", () => {
  expectTypeOf<ObjectNumber>().toExtend<number>();
  expectTypeOf<GenerationNumber>().toExtend<number>();
  expectTypeOf<ByteOffset>().toExtend<number>();
});

test("Brand 型はルート index から参照でき内部パス経由の型と一致する", () => {
  expectTypeOf<
    import("../../../index").ObjectNumber
  >().toEqualTypeOf<ObjectNumber>();
  expectTypeOf<
    import("../../../index").GenerationNumber
  >().toEqualTypeOf<GenerationNumber>();
  expectTypeOf<
    import("../../../index").ByteOffset
  >().toEqualTypeOf<ByteOffset>();
});
