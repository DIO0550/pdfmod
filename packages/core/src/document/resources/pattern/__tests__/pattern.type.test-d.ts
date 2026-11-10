import { expectTypeOf, test } from "vitest";
import type {
  PdfPattern,
  PdfPatternPaintType,
  PdfPatternTilingType,
} from "../index";

test("タイリングとシェーディングは種別番号で異なる属性へ絞り込める", () => {
  expectTypeOf<
    Extract<PdfPattern, { patternType: 1 }>["paintType"]
  >().toEqualTypeOf<1 | 2>();
  expectTypeOf<number>().not.toMatchTypeOf<PdfPatternPaintType>();
  expectTypeOf<number>().not.toMatchTypeOf<PdfPatternTilingType>();
  expectTypeOf<Extract<PdfPattern, { patternType: 2 }>>().not.toHaveProperty(
    "paintType",
  );
  expectTypeOf<Extract<PdfPattern, { patternType: 1 }>["bbox"]>().toEqualTypeOf<
    readonly [number, number, number, number]
  >();
});
