import { assert, expect, test } from "vitest";
import type {
  PdfObject,
  PdfValue,
} from "../../../../../pdf/types/pdf-types/index";
import {
  GraphicsState,
  GraphicsStateStack,
  TextObject,
  TextState,
} from "../../../../graphics-state/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { tjArrayHandler } from "../index";

const literalString = (bytes: number[]): PdfValue => ({
  type: "string",
  value: new Uint8Array(bytes),
  encoding: "literal",
});
const int = (value: number): PdfValue => ({ type: "integer", value });
const array = (elements: PdfValue[]): PdfObject => ({
  type: "array",
  elements,
});

const buildActiveContext = (
  operands: PdfObject[],
  textState: Partial<{ fontSize: number; horizontalScaling: number }> = {},
): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const activeState = GraphicsState.update(GraphicsState.create(), {
    textObject: TextObject.begin(),
    textState: TextState.update(TextState.create(), textState),
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    GraphicsStateStack.create(),
    activeState,
  );
  return { operandStack, graphicsStateStack };
};

const buildInactiveContext = (
  operands: PdfObject[],
): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  // textObject は initial（active === false）のまま。
  return { operandStack, graphicsStateStack: GraphicsStateStack.create() };
};

// inactive 状態では OPERATOR_ILLEGAL_STATE を返し、stack は両方 (operand / graphics state) 不変。
test("inactive な state では OPERATOR_ILLEGAL_STATE を返し stack を一切触らない", () => {
  const context = buildInactiveContext([array([int(50)])]);
  const beforeDepth = OperandStack.depth(context.operandStack);
  const beforeGraphics = context.graphicsStateStack;

  const result = tjArrayHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ILLEGAL_STATE");
  expect(OperandStack.depth(context.operandStack)).toBe(beforeDepth);
  expect(beforeGraphics).toBe(context.graphicsStateStack);
});

// illegal state エラーの operatorName が PDF 表記の "TJ" である。
test('illegal state エラーの operatorName は "TJ"', () => {
  const context = buildInactiveContext([array([int(50)])]);

  const result = tjArrayHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ILLEGAL_STATE");
  expect(result.error.operatorName).toBe("TJ");
});

// illegal state エラーの message は BT/ET 外を示す固定文字列。
test("illegal state エラーの message が BT/ET 外を示す全文固定", () => {
  const context = buildInactiveContext([array([int(50)])]);

  const result = tjArrayHandler(context);

  assert(!result.ok);
  expect(result.error.message).toBe(
    "TJ: text object is not active (TJ must appear within BT/ET)",
  );
});

// active 検査は pop の前で停止するため operand stack の top 内容まで保持される。
test("illegal state 時、operand stack の depth および top 内容が保持される", () => {
  const top = array([int(50)]);
  const context = buildInactiveContext([top]);

  const result = tjArrayHandler(context);

  assert(!result.ok);
  expect(OperandStack.depth(context.operandStack)).toBe(1);
  const peeked = OperandStack.peek(context.operandStack);
  assert(peeked.some);
  expect(peeked.value).toEqual(top);
});

// illegal state 時、graphics state stack の current 内部の textObject / textState が同一参照で残る。
test("illegal state 時、current.textObject と textState は同一参照で維持される", () => {
  const context = buildInactiveContext([array([int(50)])]);
  const before = GraphicsStateStack.current(context.graphicsStateStack);

  const result = tjArrayHandler(context);

  assert(!result.ok);
  const after = GraphicsStateStack.current(context.graphicsStateStack);
  expect(after.textObject).toBe(before.textObject);
  expect(after.textState).toBe(before.textState);
});

// operand 0 個では OPERATOR_OPERAND_MISSING (required=1, actual=0) を返す。
test("operand なしで OPERATOR_OPERAND_MISSING を返す", () => {
  const context = buildActiveContext([]);

  const result = tjArrayHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.required).toBe(1);
  expect(result.error.actual).toBe(0);
  expect(result.error.operatorName).toBe("TJ");
});

// operand missing エラーの message が固定書式に従う。
test("operand missing エラーの message 全文固定", () => {
  const context = buildActiveContext([]);

  const result = tjArrayHandler(context);

  assert(!result.ok);
  expect(result.error.message).toBe(
    "Operator 'TJ' requires 1 operand(s), got 0",
  );
});

// operand missing 時、early return により replaceCurrent が呼ばれず current 内部参照が維持される。
test("operand missing 時、current.textObject と textState は同一参照で維持される", () => {
  const context = buildActiveContext([]);
  const before = GraphicsStateStack.current(context.graphicsStateStack);

  const result = tjArrayHandler(context);

  assert(!result.ok);
  const after = GraphicsStateStack.current(context.graphicsStateStack);
  expect(after.textObject).toBe(before.textObject);
  expect(after.textState).toBe(before.textState);
});

// 配列以外の top-level operand は expected="array" で拒否される。
// top-level は PdfObject（stream を含む）。
test.each<[string, PdfObject]>([
  ["integer", { type: "integer", value: 1 }],
  ["real", { type: "real", value: 1.5 }],
  ["string", literalString([0x48])],
  ["name", { type: "name", value: "F1" }],
  ["boolean", { type: "boolean", value: true }],
  ["null", { type: "null" }],
  ["dictionary", { type: "dictionary", entries: new Map() }],
  [
    "indirect-ref",
    { type: "indirect-ref", objectNumber: 1, generationNumber: 0 },
  ],
  [
    "stream",
    {
      type: "stream",
      dictionary: { type: "dictionary", entries: new Map() },
      data: new Uint8Array(),
    },
  ],
])(
  "top-level operand が %s のとき OPERATOR_OPERAND_TYPE_MISMATCH (expected=array) を返す",
  (typeName, operand) => {
    const context = buildActiveContext([operand]);

    const result = tjArrayHandler(context);

    assert(!result.ok);
    assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
    expect(result.error.expected).toBe("array");
    expect(result.error.actual).toBe(typeName);
    expect(result.error.operatorName).toBe("TJ");
    expect(result.error.message).toBe(
      `Operator 'TJ' expected array operand, got ${typeName}`,
    );
  },
);

// top-level type mismatch 時、commit せず current 内部参照が維持される。
test("top-level type mismatch 時、current.textObject と textState は同一参照で維持される", () => {
  const context = buildActiveContext([{ type: "integer", value: 1 }]);
  const before = GraphicsStateStack.current(context.graphicsStateStack);

  const result = tjArrayHandler(context);

  assert(!result.ok);
  const after = GraphicsStateStack.current(context.graphicsStateStack);
  expect(after.textObject).toBe(before.textObject);
  expect(after.textState).toBe(before.textState);
});

// 既存ハンドラ規約: 部分消費した operand stack は復元しない。
// 余剰として積んだ integer は残り、検査対象として pop された array 以外の operand のみ失われる。
test("top-level type mismatch 後、pop 済み operand は復元しない（余剰 operand のみ残る）", () => {
  const context = buildActiveContext([
    { type: "integer", value: 99 },
    { type: "name", value: "F1" },
  ]);

  const result = tjArrayHandler(context);

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(OperandStack.depth(context.operandStack)).toBe(1);
  const top = OperandStack.peek(context.operandStack);
  assert(top.some);
  expect(top.value).toEqual({ type: "integer", value: 99 });
});

// 配列要素が許可されない型のとき expected="string|integer|real" で拒否される。
// 配列要素は PdfValue（stream を含まない）に限定されるため、ジェネリクスは PdfValue。
test.each<[string, PdfValue]>([
  ["name", { type: "name", value: "F1" }],
  ["boolean", { type: "boolean", value: true }],
  ["null", { type: "null" }],
  ["array", { type: "array", elements: [] }],
  ["dictionary", { type: "dictionary", entries: new Map() }],
  [
    "indirect-ref",
    { type: "indirect-ref", objectNumber: 1, generationNumber: 0 },
  ],
])(
  "配列要素が %s のとき OPERATOR_OPERAND_TYPE_MISMATCH (expected=string|integer|real) を返す",
  (typeName, element) => {
    const context = buildActiveContext([array([element])], { fontSize: 12 });

    const result = tjArrayHandler(context);

    assert(!result.ok);
    assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
    expect(result.error.expected).toBe("string|integer|real");
    expect(result.error.actual).toBe(typeName);
    expect(result.error.operatorName).toBe("TJ");
    expect(result.error.message).toBe(
      `Operator 'TJ' expected string|integer|real array element, got ${typeName}`,
    );
  },
);

// 先頭要素が許可されない型のとき、何も累積していないため graphicsStateStack 同一参照で err。
test("先頭要素が許可されない型のとき graphicsStateStack は同一参照のまま err", () => {
  const context = buildActiveContext(
    [array([{ type: "name", value: "X" }, int(50)])],
    { fontSize: 12, horizontalScaling: 100 },
  );
  const beforeStack = context.graphicsStateStack;

  const result = tjArrayHandler(context);

  assert(!result.ok);
  expect(context.graphicsStateStack).toBe(beforeStack);
});

// 配列要素 type mismatch 時、current 内部の textObject / textState 個別に同一参照保持。
test("配列要素 type mismatch 時、current.textObject と textState は同一参照で維持される", () => {
  const context = buildActiveContext([array([{ type: "name", value: "X" }])], {
    fontSize: 12,
  });
  const before = GraphicsStateStack.current(context.graphicsStateStack);

  const result = tjArrayHandler(context);

  assert(!result.ok);
  const after = GraphicsStateStack.current(context.graphicsStateStack);
  expect(after.textObject).toBe(before.textObject);
  expect(after.textState).toBe(before.textState);
});

// 配列前半で integer を消化したあと、後半で name に当たって即 err。
// 代替案 A: err 経路では commit せず graphicsStateStack は同一参照のまま。
test("部分適用エラー時 graphicsStateStack は同一参照を保つ（commit せず即 err）", () => {
  const context = buildActiveContext(
    [array([int(50), { type: "name", value: "X" }, int(100)])],
    { fontSize: 12, horizontalScaling: 100 },
  );
  const beforeStack = context.graphicsStateStack;

  const result = tjArrayHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(context.graphicsStateStack).toBe(beforeStack);
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  expect(current.textObject.textMatrix[4]).toBe(0);
  expect(current.textObject.textMatrix[5]).toBe(0);
});

// 部分適用エラー時、operand stack は array を pop 済みのまま戻らない（既存ハンドラ規約）。
test("部分適用エラー時 operand stack は復元されない", () => {
  const context = buildActiveContext(
    [array([int(50), { type: "name", value: "X" }])],
    { fontSize: 12 },
  );

  const result = tjArrayHandler(context);

  assert(!result.ok);
  expect(OperandStack.depth(context.operandStack)).toBe(0);
});

// 複数の数値要素を消化したあとに許可されない型に当たっても、commit せず textMatrix は初期値のまま。
// 累積カウントが 2 件以上でも代替案 A が成立することを固定する。
test("複数数値消化後の err でも graphicsStateStack 同一参照（[int, int, name]）", () => {
  const context = buildActiveContext(
    [array([int(50), int(80), { type: "name", value: "X" }])],
    { fontSize: 12, horizontalScaling: 100 },
  );
  const beforeStack = context.graphicsStateStack;

  const result = tjArrayHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(context.graphicsStateStack).toBe(beforeStack);
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  expect(current.textObject.textMatrix[4]).toBe(0);
});
