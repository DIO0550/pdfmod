import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { tfHandler } from "../index";

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

test("operand 0 個では MISSING（required:2, actual:0）を返す", () => {
  const ctx = buildContext([]);

  const result = tfHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("Tf");
  expect(result.error.required).toBe(2);
  expect(result.error.actual).toBe(0);
  expect(result.error.message).toBe(
    "Operator 'Tf' requires 2 operand(s), got 0",
  );
});

test("有効な数値 1 個のみでは MISSING（required:2, actual:1）を返す", () => {
  const ctx = buildContext([{ type: "integer", value: 12 }]);

  const result = tfHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("Tf");
  expect(result.error.required).toBe(2);
  expect(result.error.actual).toBe(1);
  expect(result.error.message).toBe(
    "Operator 'Tf' requires 2 operand(s), got 1",
  );
});

test("size 位置が非数値なら MISMATCH（expected:'number', actual:'name'）を返す", () => {
  const ctx = buildContext([
    { type: "name", value: "F1" },
    { type: "name", value: "X" },
  ]);

  const result = tfHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("Tf");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe("name");
  expect(result.error.message).toBe(
    "Operator 'Tf' expected number operand, got name",
  );
});

test("頂上=数値・その下=boolean なら MISMATCH（expected:'name', actual:'boolean'）を返す", () => {
  const ctx = buildContext([
    { type: "boolean", value: true },
    { type: "integer", value: 12 },
  ]);

  const result = tfHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("Tf");
  expect(result.error.expected).toBe("name");
  expect(result.error.actual).toBe("boolean");
  expect(result.error.message).toBe(
    "Operator 'Tf' expected name operand, got boolean",
  );
});

test.each<[string, PdfObject]>([
  ["boolean", { type: "boolean", value: true }],
  ["null", { type: "null" }],
  [
    "string",
    { type: "string", value: new Uint8Array([0x61]), encoding: "literal" },
  ],
  ["integer", { type: "integer", value: 1 }],
  ["array", { type: "array", elements: [] }],
])("font 位置が %s なら MISMATCH（expected:'name'）を返す", (type, fontOperand) => {
  const ctx = buildContext([fontOperand, { type: "integer", value: 12 }]);

  const result = tfHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.expected).toBe("name");
  expect(result.error.actual).toBe(type);
});

test("MISSING actual:1 後も部分消費した operand は復元せず depth=0", () => {
  const ctx = buildContext([{ type: "integer", value: 12 }]);

  const result = tfHandler(ctx);

  assert(!result.ok);
  expect(OperandStack.depth(ctx.operandStack)).toBe(0);
});

test("MISMATCH 'number' 後は size 位置のみ pop され depth=1", () => {
  const ctx = buildContext([
    { type: "name", value: "F1" },
    { type: "name", value: "X" },
  ]);

  const result = tfHandler(ctx);

  assert(!result.ok);
  expect(OperandStack.depth(ctx.operandStack)).toBe(1);
});

test("MISMATCH 'name' 後は size・font とも pop され（非復元）depth=0", () => {
  const ctx = buildContext([
    { type: "boolean", value: true },
    { type: "integer", value: 12 },
  ]);

  const result = tfHandler(ctx);

  assert(!result.ok);
  expect(OperandStack.depth(ctx.operandStack)).toBe(0);
});
