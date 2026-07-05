import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  GraphicsState,
  GraphicsStateStack,
  TextObject,
} from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { tdHandler } from "../index";

// active=true の context（operand 不足・型不一致テスト用）。
// operand は PDF 表記 `tx ty Td` の並び（配列を [tx, ty] 順）で渡す。
const buildActiveContext = (operands: PdfObject[]): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const activeState = GraphicsState.update(GraphicsState.create(), {
    textObject: TextObject.begin(),
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    GraphicsStateStack.create(),
    activeState,
  );
  return {
    operandStack,
    graphicsStateStack,
    markedContentStack: MarkedContentStack.create(),
  };
};

// inactive な context（active=false ガードテスト用。GraphicsStateStack.create() 既定）。
const buildInactiveContext = (
  operands: PdfObject[],
): OperatorHandlerContext => {
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

const int = (value: number): PdfObject => ({ type: "integer", value });

// 全非数値型網羅（tl.error.test.ts より流用）。
const nonNumericOperands: [string, PdfObject][] = [
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
];

test("active=false で Td を呼ぶと OPERATOR_ILLEGAL_STATE を返し operand stack は不変", () => {
  const context = buildInactiveContext([int(72), int(720)]);
  const result = tdHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ILLEGAL_STATE");
  expect(result.error.operatorName).toBe("Td");
  expect(result.error.message).toBe(
    "Td: text object is not active (Td must appear within BT/ET)",
  );
  expect(OperandStack.depth(context.operandStack)).toBe(2);
});

test("operand 0 個のとき OPERATOR_OPERAND_MISSING（actual=0）を返す", () => {
  const context = buildActiveContext([]);
  const result = tdHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("Td");
  expect(result.error.required).toBe(2);
  expect(result.error.actual).toBe(0);
  expect(result.error.message).toBe(
    "Operator 'Td' requires 2 operand(s), got 0",
  );
});

test("operand 1 個（ty のみ）のとき OPERATOR_OPERAND_MISSING（actual=1）を返し ty は pop 済みで depth=0", () => {
  const context = buildActiveContext([int(720)]);
  const result = tdHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.required).toBe(2);
  expect(result.error.actual).toBe(1);
  expect(result.error.message).toBe(
    "Operator 'Td' requires 2 operand(s), got 1",
  );
  expect(OperandStack.depth(context.operandStack)).toBe(0);
});

test.each(
  nonNumericOperands,
)("ty が %s のとき OPERATOR_OPERAND_TYPE_MISMATCH を返す", (typeName, operand) => {
  // buildActiveContext は配列を [tx, ty] 順で受け取る（top=ty を先に pop）。
  // ここでは tx=数値 / ty=非数値 なので、先に pop される ty で MISMATCH になる。
  const context = buildActiveContext([int(72), operand]);
  const result = tdHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("Td");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe(typeName);
  expect(result.error.message).toBe(
    `Operator 'Td' expected number operand, got ${typeName}`,
  );
});

test.each(
  nonNumericOperands,
)("tx が %s のとき（ty は数値）OPERATOR_OPERAND_TYPE_MISMATCH を返す", (typeName, operand) => {
  // buildActiveContext は配列を [tx, ty] 順で受け取る（top=ty を先に pop）。
  // ここでは tx=非数値 / ty=数値 なので、ty を pop して通過した後 tx で MISMATCH になる。
  const context = buildActiveContext([operand, int(720)]);
  const result = tdHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("Td");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe(typeName);
  expect(result.error.message).toBe(
    `Operator 'Td' expected number operand, got ${typeName}`,
  );
});

test("TYPE_MISMATCH 後も部分消費した operand は復元せず、余剰 operand のみ残る", () => {
  const surplus: PdfObject = int(99);
  // bottom→top = [surplus, tx(非数値), ty(数値)]。
  // ty=数値 は pop して通過、tx=非数値 で MISMATCH。pop 済みは戻さない。
  const context = buildActiveContext([
    surplus,
    { type: "name", value: "F1" },
    int(7),
  ]);
  const result = tdHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(OperandStack.depth(context.operandStack)).toBe(1);
  const top = OperandStack.peek(context.operandStack);
  assert(top.some);
  expect(top.value).toEqual(surplus);
});
