import { expectTypeOf, test } from "vitest";
import type { PdfObject } from "../../../pdf/types/pdf-types/index";
import { OperandStack } from "../index";

test("OperandStack は Brand を持たず readonly な items だけを持つ", () => {
  expectTypeOf<OperandStack>().toEqualTypeOf<{
    readonly items: PdfObject[];
  }>();
});

test("OperandStack の items は再代入できない", () => {
  const stack = OperandStack.create();
  // @ts-expect-error items は readonly
  stack.items = [];
});
