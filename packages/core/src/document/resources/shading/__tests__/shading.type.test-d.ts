import { expectTypeOf, test } from "vitest";
import type { PdfStream } from "../../../../pdf/types/index";
import type { PdfShading, PdfShadingType } from "../index";

test("ShadingTypeは1〜7に閉じメッシュの型にはストリームが必須になる", () => {
  expectTypeOf<PdfShadingType>().toEqualTypeOf<1 | 2 | 3 | 4 | 5 | 6 | 7>();
  expectTypeOf<number>().not.toMatchTypeOf<PdfShadingType>();
  expectTypeOf<
    Extract<PdfShading, { shadingType: 4 | 5 | 6 | 7 }>["stream"]
  >().toEqualTypeOf<PdfStream>();
});
