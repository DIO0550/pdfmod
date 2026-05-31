import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { tcHandler } from "../index";

const buildContext = (operands: PdfObject[]): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const graphicsStateStack = GraphicsStateStack.create();
  return { operandStack, graphicsStateStack };
};

test("operand が 0 個のとき OPERATOR_OPERAND_MISSING を返す", () => {
  const context = buildContext([]);
  const result = tcHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("Tc");
  expect(result.error.required).toBe(1);
  expect(result.error.actual).toBe(0);
  expect(result.error.message).toBe(
    "Operator 'Tc' requires 1 operand(s), got 0",
  );
});

test.each<[string, PdfObject]>([
  ["name", { type: "name", value: "F1" }],
  ["boolean", { type: "boolean", value: true }],
  ["null", { type: "null" }],
  [
    "string",
    { type: "string", value: new Uint8Array([0x61]), encoding: "literal" },
  ],
  ["array", { type: "array", elements: [] }],
])("operand が %s のとき OPERATOR_OPERAND_TYPE_MISMATCH を返す", (typeName, operand) => {
  const context = buildContext([operand]);
  const result = tcHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("Tc");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe(typeName);
  expect(result.error.message).toBe(
    `Operator 'Tc' expected number operand, got ${typeName}`,
  );
});

test("MISMATCH 後も部分消費した operand は復元せず、余剰 operand のみ残る", () => {
  const surplus: PdfObject = { type: "integer", value: 99 };
  const context = buildContext([surplus, { type: "name", value: "F1" }]);

  const result = tcHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(OperandStack.depth(context.operandStack)).toBe(1);
  const top = OperandStack.peek(context.operandStack);
  assert(top.some);
  expect(top.value).toEqual(surplus);
});
