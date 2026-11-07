import { expectTypeOf, test } from "vitest";
import type { ColorSpace } from "../index";

test("ICCプロファイルの成分数は1・3・4に限定する", () => {
  expectTypeOf<
    Extract<ColorSpace, { family: "ICCBased" }>["components"]
  >().toEqualTypeOf<1 | 3 | 4>();
});

test("任意の文字列は色空間として使えない", () => {
  expectTypeOf<string>().not.toMatchTypeOf<ColorSpace>();
});
