import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  GraphicsState,
  GraphicsStateStack,
  Matrix,
  TextObject,
} from "../../../../graphics-state/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { tdHandler } from "../index";

// active な text object を持つ context を operand 付きで組む。
// operand は PDF 表記 `tx ty Td` の並び（配列を [tx, ty] 順）で渡す。
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
  return { operandStack, graphicsStateStack };
};

const int = (value: number): PdfObject => ({ type: "integer", value });
const real = (value: number): PdfObject => ({ type: "real", value });

test("'72 720 Td' で textMatrix / textLineMatrix がともに [1,0,0,1,72,720] になる", () => {
  const context = buildActiveContext([int(72), int(720)]);
  const result = tdHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 72, 720),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 72, 720),
  );
});

test("'72 720 Td' の後 '0 -14 Td' で両 matrix が [1,0,0,1,72,706] に相対累積する", () => {
  const first = tdHandler(buildActiveContext([int(72), int(720)]));
  assert(first.ok);

  const firstObject = GraphicsStateStack.current(
    first.value.graphicsStateStack,
  ).textObject;
  const second = tdHandler(buildActiveContext([int(0), int(-14)], firstObject));

  assert(second.ok);
  const current = GraphicsStateStack.current(second.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 72, 706),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 72, 706),
  );
});

test("integer / real 混在 operand でも両 matrix に値が格納される", () => {
  const context = buildActiveContext([int(72), real(720.5)]);
  const result = tdHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 72, 720.5),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 72, 720.5),
  );
});

test("非 identity Tlm S(2,1) への Td(5,7) は translate(5,7) × S = [2,0,0,1,10,7]（左乗算・非可換）", () => {
  // textLineMatrix = S(2,1) = [2,0,0,1,0,0] を仕込んだ active state を用意する。
  // 期待値は translate(5,7) × S = [2,0,0,1,10,7]。
  // 逆順 S × translate(5,7) なら [2,0,0,1,5,7] となり、左乗算の向きが担保される。
  const scaledObject = TextObject.setMatrix(
    TextObject.begin(),
    Matrix.create(2, 0, 0, 1, 0, 0),
  );
  const context = buildActiveContext([int(5), int(7)], scaledObject);
  const result = tdHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(2, 0, 0, 1, 10, 7),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(2, 0, 0, 1, 10, 7),
  );
});

test("成功時に text object は active のまま維持される", () => {
  const context = buildActiveContext([int(72), int(720)]);
  const result = tdHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(TextObject.isActive(current.textObject)).toBe(true);
});

test("成功時に operandStack は同一参照で返り depth が 0 になる", () => {
  const context = buildActiveContext([int(72), int(720)]);
  const result = tdHandler(context);

  assert(result.ok);
  expect(result.value.operandStack).toBe(context.operandStack);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("余剰 operand があっても末尾 2 個のみ pop し残り 1 個を保持する", () => {
  const context = buildActiveContext([int(99), int(5), int(7)]);
  const result = tdHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 5, 7),
  );
  expect(OperandStack.depth(result.value.operandStack)).toBe(1);
});

test.each<[string, PdfObject, number]>([
  ["+Infinity", real(Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY],
  ["-Infinity", real(Number.NEGATIVE_INFINITY), Number.NEGATIVE_INFINITY],
  ["負値", real(-3.5), -3.5],
  ["小数", real(1.25), 1.25],
  ["0", int(0), 0],
])("境界値 '%s' を ty に渡しても値域検証せず matrix にそのまま格納する", (_label, operand, expected) => {
  const context = buildActiveContext([int(10), operand]);
  const result = tdHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix[5]).toBe(expected);
});

test("境界値 NaN を ty に渡しても値域検証せず matrix に NaN を格納する", () => {
  // NaN は toEqual / toBe の NaN 比較仕様に頼らず Number.isNaN で明示判定する。
  const context = buildActiveContext([int(10), real(Number.NaN)]);
  const result = tdHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(Number.isNaN(current.textObject.textMatrix[5])).toBe(true);
});
