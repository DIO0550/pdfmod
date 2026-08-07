import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { riHandler } from "../index";

const buildContext = (operands: PdfObject[]): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const graphicsStateStack = GraphicsStateStack.create();
  return {
    operandStack,
    graphicsStateStack,
    markedContentStack: MarkedContentStack.create(),
  };
};

test("空 operand stack では OPERATOR_OPERAND_MISSING を返す", () => {
  const ctx = buildContext([]);

  const result = riHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("ri");
  expect(result.error.required).toBe(1);
  expect(result.error.actual).toBe(0);
  expect(result.error.message).toBe(
    "Operator 'ri' requires 1 operand(s), got 0",
  );
});

test.each([
  {
    type: "integer" as const,
    operand: { type: "integer", value: 10 } as PdfObject,
  },
  {
    type: "real" as const,
    operand: { type: "real", value: 0.5 } as PdfObject,
  },
  {
    type: "boolean" as const,
    operand: { type: "boolean", value: true } as PdfObject,
  },
])("末尾が $type のとき OPERATOR_OPERAND_TYPE_MISMATCH を返す", ({
  type,
  operand,
}) => {
  const ctx = buildContext([operand]);

  const result = riHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("ri");
  expect(result.error.expected).toBe("name");
  expect(result.error.actual).toBe(type);
  expect(result.error.message).toBe(
    `Operator 'ri' expected name operand, got ${type}`,
  );
});

test("末尾が number のとき (TYPE_MISMATCH)、末尾 1 つだけ pop し残り operand は保持される", () => {
  const head: PdfObject = { type: "name", value: "RelativeColorimetric" };
  const tail: PdfObject = { type: "integer", value: 123 };
  const ctx = buildContext([head, tail]);

  const result = riHandler(ctx);

  assert(!result.ok);
  expect(OperandStack.depth(ctx.operandStack)).toBe(1);
  const top = OperandStack.peek(ctx.operandStack);
  assert(top.some);
  expect(top.value).toEqual(head);
});
