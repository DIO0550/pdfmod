import { expectTypeOf, test } from "vitest";
import type { PdfName } from "../../../../pdf/types/pdf-types/index";
import { none } from "../../../../utils/option/index";
import { type MarkedContentEntry, MarkedContentStack } from "../../index";

test("MarkedContentStack は Brand を持たず readonly な current だけを持つ", () => {
  expectTypeOf<MarkedContentStack>().toEqualTypeOf<{
    readonly current: ReadonlyArray<MarkedContentEntry>;
  }>();
});

test("MarkedContentStack の current に entry を積めない", () => {
  const stack = MarkedContentStack.create();
  const tag: PdfName = { type: "name", value: "Span" };
  // @ts-expect-error current は ReadonlyArray
  stack.current.push({ tag, properties: none });
});
