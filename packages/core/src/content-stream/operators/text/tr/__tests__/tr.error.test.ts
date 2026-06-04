import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  GraphicsState,
  GraphicsStateStack,
  TextRenderingMode,
  TextState,
} from "../../../../graphics-state/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { trHandler } from "../index";

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
  const result = trHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("Tr");
  expect(result.error.required).toBe(1);
  expect(result.error.actual).toBe(0);
  expect(result.error.message).toBe(
    "Operator 'Tr' requires 1 operand(s), got 0",
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
  ["dictionary", { type: "dictionary", entries: new Map() }],
  [
    "indirect-ref",
    { type: "indirect-ref", objectNumber: 1, generationNumber: 0 },
  ],
])("operand が %s のとき OPERATOR_OPERAND_TYPE_MISMATCH を返す", (typeName, operand) => {
  const context = buildContext([operand]);
  const result = trHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("Tr");
  expect(result.error.expected).toBe("integer");
  expect(result.error.actual).toBe(typeName);
  expect(result.error.message).toBe(
    `Operator 'Tr' expected integer operand, got ${typeName}`,
  );
});

test.each<[string, number]>([
  ["3.14", 3.14],
  ["3.0", 3.0],
])("real %s（非整数型）は VALUE ではなく TYPE_MISMATCH を返す", (_label, value) => {
  const context = buildContext([{ type: "real", value }]);
  const result = trHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.expected).toBe("integer");
  expect(result.error.actual).toBe("real");
});

test.each<[string, number]>([
  ["上限超過 8", 8],
  ["下限未満 -1", -1],
  ["巨大値 MAX_SAFE_INTEGER", Number.MAX_SAFE_INTEGER],
])("integer 値域外 %s のとき OPERATOR_OPERAND_VALUE_OUT_OF_RANGE を返す", (_label, value) => {
  const context = buildContext([{ type: "integer", value }]);
  const result = trHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_VALUE_OUT_OF_RANGE");
  expect(result.error.operatorName).toBe("Tr");
  expect(result.error.allowed).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  expect(result.error.actual).toBe(value);
});

test("integer 8 のとき message が LineCap と同形式になる", () => {
  const context = buildContext([{ type: "integer", value: 8 }]);
  const result = trHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_VALUE_OUT_OF_RANGE");
  expect(result.error.message).toBe(
    "Operator 'Tr' operand value 8 is out of range, expected one of [0, 1, 2, 3, 4, 5, 6, 7]",
  );
});

test("TYPE_MISMATCH 後も部分消費した operand は復元せず、余剰 operand のみ残る", () => {
  const surplus: PdfObject = { type: "integer", value: 5 };
  const context = buildContext([surplus, { type: "name", value: "F1" }]);

  const result = trHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(OperandStack.depth(context.operandStack)).toBe(1);
  const top = OperandStack.peek(context.operandStack);
  assert(top.some);
  expect(top.value).toEqual(surplus);
});

test("VALUE_OUT_OF_RANGE 後も部分消費した operand は復元せず、余剰 operand のみ残る", () => {
  const surplus: PdfObject = { type: "integer", value: 5 };
  const context = buildContext([surplus, { type: "integer", value: 8 }]);

  const result = trHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_VALUE_OUT_OF_RANGE");
  expect(OperandStack.depth(context.operandStack)).toBe(1);
  const top = OperandStack.peek(context.operandStack);
  assert(top.some);
  expect(top.value).toEqual(surplus);
});

// 事前に renderingMode を非デフォルト値（create(2)=FILL_STROKE）へ設定した context を構築する。
// デフォルト FILL(0) へのリセットという不正実装を検出するため、非デフォルト起点が必須。
const seedFillStroke = (): OperatorHandlerContext => {
  const stack = GraphicsStateStack.create();
  const current = GraphicsStateStack.current(stack);
  const textState = TextState.update(current.textState, {
    renderingMode: TextRenderingMode.create(TextRenderingMode.FILL_STROKE),
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    stack,
    GraphicsState.update(current, { textState }),
  );
  return { operandStack: OperandStack.create(), graphicsStateStack };
};

test.each<[string, PdfObject, string]>([
  [
    "TYPE_MISMATCH(name)",
    { type: "name", value: "F1" },
    "OPERATOR_OPERAND_TYPE_MISMATCH",
  ],
  [
    "VALUE_OUT_OF_RANGE(8)",
    { type: "integer", value: 8 },
    "OPERATOR_OPERAND_VALUE_OUT_OF_RANGE",
  ],
])("%s 失敗後も renderingMode は事前設定 create(2) のまま不変", (_label, operand, code) => {
  const context = seedFillStroke();
  OperandStack.push(context.operandStack, operand);

  const result = trHandler(context);

  assert(!result.ok);
  assert(result.error.code === code);
  const after = GraphicsStateStack.current(
    context.graphicsStateStack,
  ).textState;
  expect(after.renderingMode).toBe(TextRenderingMode.create(2));
});
