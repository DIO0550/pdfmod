import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  GraphicsState,
  GraphicsStateStack,
  Matrix,
  TextObject,
} from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { tmHandler } from "../index";

// active な text object を持つ context を operand 付きで組む。
// operand は PDF 表記 `a b c d e f Tm` の並び（配列を [a, b, c, d, e, f] 順）で渡す。
const buildActiveContext = (
  operands: PdfObject[],
  textObject: TextObject = TextObject.begin(),
): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const activeState = GraphicsState.update(GraphicsState.create(), {
    textObject,
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

const int = (value: number): PdfObject => ({ type: "integer", value });
const real = (value: number): PdfObject => ({ type: "real", value });

test("'1 0 0 1 72 720 Tm' で textMatrix / textLineMatrix がともに [1,0,0,1,72,720] になる", () => {
  const context = buildActiveContext([
    int(1),
    int(0),
    int(0),
    int(1),
    int(72),
    int(720),
  ]);
  const result = tmHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 72, 720),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 72, 720),
  );
});

test("'2 3 5 7 11 13 Tm'（a..f すべて相異）で両 matrix が [2,3,5,7,11,13] になり f→a pop + reverse の順序が保たれる", () => {
  // a..f を相異な素数にすることで、b/c 取り違えや reverse 漏れを検出する。
  const context = buildActiveContext([
    int(2),
    int(3),
    int(5),
    int(7),
    int(11),
    int(13),
  ]);
  const result = tmHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(2, 3, 5, 7, 11, 13),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(2, 3, 5, 7, 11, 13),
  );
});

test("既存 textMatrix=[1,0,0,1,100,100] を無視して '2 0 0 2 10 20 Tm' で [2,0,0,2,10,20] に絶対上書きする", () => {
  // Td の相対移動と異なり、Tm は現在の行列に依存せず matrix で置換する。
  const existing = TextObject.setMatrix(
    TextObject.begin(),
    Matrix.create(1, 0, 0, 1, 100, 100),
  );
  const context = buildActiveContext(
    [int(2), int(0), int(0), int(2), int(10), int(20)],
    existing,
  );
  const result = tmHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(2, 0, 0, 2, 10, 20),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(2, 0, 0, 2, 10, 20),
  );
});

test("integer / real 混在 operand でも両 matrix に各 value がそのまま格納される", () => {
  // real 位置に整数で表せない小数 72.5 を置き、real 経路が値を丸めず保持することを実証する
  // （72.0 だと int(72) と同値になり real 経路の検証にならない）。
  const context = buildActiveContext([
    int(1),
    int(0),
    int(0),
    int(1),
    real(72.5),
    int(720),
  ]);
  const result = tmHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 72.5, 720),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 72.5, 720),
  );
});

test("小数・負値（'1.5 0 0 -2.25 -10.5 0 Tm'）を値域検証せず matrix にそのまま格納する", () => {
  const context = buildActiveContext([
    real(1.5),
    int(0),
    int(0),
    real(-2.25),
    real(-10.5),
    int(0),
  ]);
  const result = tmHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1.5, 0, 0, -2.25, -10.5, 0),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1.5, 0, 0, -2.25, -10.5, 0),
  );
});

test.each<[string, PdfObject, number]>([
  ["+Infinity", real(Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY],
  ["-Infinity", real(Number.NEGATIVE_INFINITY), Number.NEGATIVE_INFINITY],
])("境界値 '%s' を a に渡しても値域検証せず matrix[0] にそのまま格納し result.ok", (_label, operand, expected) => {
  const context = buildActiveContext([
    operand,
    int(0),
    int(0),
    int(1),
    int(0),
    int(0),
  ]);
  const result = tmHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix[0]).toBe(expected);
});

test("境界値 NaN を a に渡しても値域検証せず matrix[0] に NaN を格納し result.ok", () => {
  // NaN は toEqual / toBe の NaN 比較仕様に頼らず Number.isNaN で明示判定する。
  const context = buildActiveContext([
    real(Number.NaN),
    int(0),
    int(0),
    int(1),
    int(0),
    int(0),
  ]);
  const result = tmHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(Number.isNaN(current.textObject.textMatrix[0])).toBe(true);
});

test("余剰 operand（非数値）があっても頂上 6 個（f→a）のみ pop し、7 個目は型検査せず残して depth=1 になる", () => {
  // push 順 [余剰(非数値 name), a=1, b=0, c=0, d=1, e=72, f=720]。頂上は f=720。
  // 余剰を非数値にすることで、ループが OPERAND_COUNT=6 で確実に打ち切り 7 個目を
  // 型検査しないこと（もし 7 個 pop していれば name で TYPE_MISMATCH になり成功しない）を証明する。
  const surplus: PdfObject = { type: "name", value: "X" };
  const context = buildActiveContext([
    surplus,
    int(1),
    int(0),
    int(0),
    int(1),
    int(72),
    int(720),
  ]);
  const result = tmHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 72, 720),
  );
  expect(OperandStack.depth(result.value.operandStack)).toBe(1);
  const top = OperandStack.peek(result.value.operandStack);
  assert(top.some);
  expect(top.value).toEqual(surplus);
});

test("成功時 operandStack は context.operandStack と同一参照で返る（in-place pop）", () => {
  const context = buildActiveContext([
    int(1),
    int(0),
    int(0),
    int(1),
    int(72),
    int(720),
  ]);
  const result = tmHandler(context);

  assert(result.ok);
  expect(result.value.operandStack).toBe(context.operandStack);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("成功時に text object は active のまま維持される", () => {
  const context = buildActiveContext([
    int(1),
    int(0),
    int(0),
    int(1),
    int(72),
    int(720),
  ]);
  const result = tmHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(TextObject.isActive(current.textObject)).toBe(true);
});
