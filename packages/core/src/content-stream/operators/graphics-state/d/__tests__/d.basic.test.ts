import { assert, expect, test } from "vitest";
import type {
  PdfObject,
  PdfValue,
} from "../../../../../pdf/types/pdf-types/index";
import {
  DashPattern,
  GraphicsStateStack,
} from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { dHandler } from "../index";

const buildContext = (operands: PdfObject[]): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  return {
    operandStack,
    graphicsStateStack: GraphicsStateStack.create(),
    markedContentStack: MarkedContentStack.create(),
  };
};

const int = (value: number): PdfValue => ({ type: "integer", value });

test("dashArray [3 2] と dashPhase 11 を適用すると dashPattern が更新される", () => {
  const ctx = buildContext([
    { type: "array", elements: [int(3), int(2)] },
    int(11),
  ]);

  const result = dHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.dashPattern).toEqual(DashPattern.create([3, 2], 11));
});
