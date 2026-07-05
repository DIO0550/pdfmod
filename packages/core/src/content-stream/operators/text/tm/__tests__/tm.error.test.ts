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
import { tmHandler } from "../index";

// active=true の context（operand 不足・型不一致テスト用）。
// operand は PDF 表記 `a b c d e f Tm` の並び（配列を [a, b, c, d, e, f] 順）で渡す。
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

// 全非数値型網羅（td.error.test.ts より流用）。
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

const name = (value: string): PdfObject => ({ type: "name", value });

test("active=false で Tm を呼ぶと OPERATOR_ILLEGAL_STATE を返し operand stack は不変", () => {
  const context = buildInactiveContext([
    int(1),
    int(0),
    int(0),
    int(1),
    int(72),
    int(720),
  ]);
  const result = tmHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ILLEGAL_STATE");
  expect(result.error.operatorName).toBe("Tm");
  expect(result.error.message).toBe(
    "Tm: text object is not active (Tm must appear within BT/ET)",
  );
  expect(OperandStack.depth(context.operandStack)).toBe(6);
});

test.each([
  { label: "0 個", count: 0 },
  { label: "1 個", count: 1 },
  { label: "2 個", count: 2 },
  { label: "3 個", count: 3 },
  { label: "4 個", count: 4 },
  { label: "5 個", count: 5 },
])("operand $label のとき OPERATOR_OPERAND_MISSING（actual=push 個数）を返し、push 分は全消費で depth=0", ({
  count,
}) => {
  const operands: PdfObject[] = Array.from({ length: count }, () => int(1));
  const context = buildActiveContext(operands);
  const result = tmHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("Tm");
  expect(result.error.required).toBe(6);
  expect(result.error.actual).toBe(count);
  expect(result.error.message).toBe(
    `Operator 'Tm' requires 6 operand(s), got ${count}`,
  );
  expect(OperandStack.depth(context.operandStack)).toBe(0);
});

test.each(
  nonNumericOperands,
)("頂上 f が %s のとき OPERATOR_OPERAND_TYPE_MISMATCH を返し depth は 5（top のみ pop 済み）", (typeName, operand) => {
  // push 順 [a, b, c, d, e, f] の f（頂上）を非数値にする。最初の pop で停止する。
  const context = buildActiveContext([
    int(1),
    int(0),
    int(0),
    int(1),
    int(72),
    operand,
  ]);
  const result = tmHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("Tm");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe(typeName);
  expect(result.error.message).toBe(
    `Operator 'Tm' expected number operand, got ${typeName}`,
  );
  expect(OperandStack.depth(context.operandStack)).toBe(5);
});

test.each<{ label: string; operands: PdfObject[]; depth: number }>([
  {
    label: "a（最下層）",
    operands: [name("F1"), int(0), int(0), int(1), int(72), int(720)],
    depth: 0,
  },
  {
    label: "b",
    operands: [int(1), name("F1"), int(0), int(1), int(72), int(720)],
    depth: 1,
  },
  {
    label: "c",
    operands: [int(1), int(0), name("F1"), int(1), int(72), int(720)],
    depth: 2,
  },
  {
    label: "d",
    operands: [int(1), int(0), int(0), name("F1"), int(72), int(720)],
    depth: 3,
  },
  {
    label: "e",
    operands: [int(1), int(0), int(0), int(1), name("F1"), int(720)],
    depth: 4,
  },
  {
    label: "f（頂上）",
    operands: [int(1), int(0), int(0), int(1), int(72), name("F1")],
    depth: 5,
  },
])("PDF 位置 $label が非数値のとき TYPE_MISMATCH を返し、f→a の検査順序に応じて残 depth=$depth になる", ({
  operands,
  depth,
}) => {
  const context = buildActiveContext(operands);
  const result = tmHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.actual).toBe("name");
  // f→a の順に pop し、非数値の位置で停止する。残 depth は混入位置の index に一致する。
  expect(OperandStack.depth(context.operandStack)).toBe(depth);
});

test("TYPE_MISMATCH 後も部分消費した operand は復元せず、最下層の余剰 operand のみ残る", () => {
  const surplus = int(99);
  // push 順（bottom→top）= [surplus, a=name, b, c, d, e, f]。
  // f→b の 5 個の数値を pop して通過し、a=name で MISMATCH。pop 済みは戻さない。
  const context = buildActiveContext([
    surplus,
    name("F1"),
    int(0),
    int(0),
    int(1),
    int(72),
    int(720),
  ]);
  const result = tmHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(OperandStack.depth(context.operandStack)).toBe(1);
  const top = OperandStack.peek(context.operandStack);
  assert(top.some);
  expect(top.value).toEqual(surplus);
});
