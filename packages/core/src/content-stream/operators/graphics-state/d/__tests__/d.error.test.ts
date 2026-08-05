import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import { GraphicsStateStack } from "../../../../graphics-state/index";
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

test("operand stack が空のとき OPERATOR_OPERAND_MISSING (got 0) を返す", () => {
  const ctx = buildContext([]);

  const result = dHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.message).toBe(
    "Operator 'd' requires 2 operand(s), got 0",
  );
  expect(result.error.operatorName).toBe("d");
  expect(result.error.required).toBe(2);
  expect(result.error.actual).toBe(0);
});

test("phase が name 型のとき OPERATOR_OPERAND_TYPE_MISMATCH (expected number) を返す", () => {
  const ctx = buildContext([
    { type: "array", elements: [{ type: "integer", value: 3 }] },
    { type: "name", value: "Foo" },
  ]);

  const result = dHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.message).toBe(
    "Operator 'd' expected number operand, got name",
  );
  expect(result.error.operatorName).toBe("d");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe("name");
});

test("operand 1 個のみでそれが配列のとき phase の型 mismatch (got array) になる", () => {
  const ctx = buildContext([
    {
      type: "array",
      elements: [
        { type: "integer", value: 3 },
        { type: "integer", value: 2 },
      ],
    },
  ]);

  const result = dHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.message).toBe(
    "Operator 'd' expected number operand, got array",
  );
  expect(result.error.operatorName).toBe("d");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe("array");
});

test("dashArray 位置が integer のとき OPERATOR_OPERAND_TYPE_MISMATCH (expected array) を返す", () => {
  const ctx = buildContext([
    { type: "integer", value: 3 },
    { type: "integer", value: 11 },
  ]);

  const result = dHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.message).toBe(
    "Operator 'd' expected array operand, got integer",
  );
  expect(result.error.operatorName).toBe("d");
  expect(result.error.expected).toBe("array");
  expect(result.error.actual).toBe("integer");
});

test("operand が phase 相当の 1 個のみのとき OPERATOR_OPERAND_MISSING (got 1) を返す", () => {
  const ctx = buildContext([{ type: "integer", value: 11 }]);

  const result = dHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.message).toBe(
    "Operator 'd' requires 2 operand(s), got 1",
  );
  expect(result.error.operatorName).toBe("d");
  expect(result.error.required).toBe(2);
  expect(result.error.actual).toBe(1);
});

test("配列要素の先頭 (index 0) が name のとき index 付き OPERATOR_OPERAND_TYPE_MISMATCH を返す", () => {
  const ctx = buildContext([
    { type: "array", elements: [{ type: "name", value: "Foo" }] },
    { type: "integer", value: 11 },
  ]);

  const result = dHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.message).toBe(
    "Operator 'd' expected number array element, got name at index 0",
  );
  expect(result.error.operatorName).toBe("d");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe("name");
});

test("配列要素の途中 (index 1) が string のとき index 付き OPERATOR_OPERAND_TYPE_MISMATCH を返す", () => {
  const ctx = buildContext([
    {
      type: "array",
      elements: [
        { type: "integer", value: 3 },
        { type: "string", value: new Uint8Array([0x78]), encoding: "literal" },
        { type: "integer", value: 2 },
      ],
    },
    { type: "integer", value: 11 },
  ]);

  const result = dHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.message).toBe(
    "Operator 'd' expected number array element, got string at index 1",
  );
  expect(result.error.operatorName).toBe("d");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe("string");
});

test("dashArray 不足 (MISSING got 1) エラー後も phase は積み戻されず operand stack は空のまま", () => {
  const ctx = buildContext([{ type: "integer", value: 11 }]);

  const result = dHandler(ctx);

  assert(!result.ok);
  expect(OperandStack.depth(ctx.operandStack)).toBe(0);
});

test("配列要素 mismatch エラー後も phase / dashArray は消費されたまま operand stack は空のまま", () => {
  const ctx = buildContext([
    { type: "array", elements: [{ type: "name", value: "Foo" }] },
    { type: "integer", value: 11 },
  ]);

  const result = dHandler(ctx);

  assert(!result.ok);
  expect(OperandStack.depth(ctx.operandStack)).toBe(0);
});
