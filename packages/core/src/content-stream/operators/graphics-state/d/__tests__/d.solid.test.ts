import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
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

test("`[] 0 d` 相当の operand で dashPattern が solid に戻る", () => {
  const ctx = buildContext([
    { type: "array", elements: [] },
    { type: "integer", value: 0 },
  ]);

  const result = dHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.dashPattern).toEqual(DashPattern.solid());
});

test("`[] 5 d` 相当の空配列 + 非ゼロ phase では phase がそのまま保持される", () => {
  const ctx = buildContext([
    { type: "array", elements: [] },
    { type: "integer", value: 5 },
  ]);

  const result = dHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.dashPattern).toEqual(DashPattern.create([], 5));
});
