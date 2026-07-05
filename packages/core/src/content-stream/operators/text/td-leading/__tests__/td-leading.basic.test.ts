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
import { tdLeadingHandler } from "../index";

// active な text object を持つ context を operand 付きで組む。
// operand は PDF 表記 `tx ty TD` の並び（配列を [tx, ty] 順）で渡す。
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

test("'72 720 TD' で両 matrix=[1,0,0,1,72,720] かつ leading=-720 になる", () => {
  const context = buildActiveContext([int(72), int(720)]);
  const result = tdLeadingHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 72, 720),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 72, 720),
  );
  expect(current.textState.leading).toBe(-720);
});

test("'0 -14 TD' で leading=14（符号反転）かつ matrix が [1,0,0,1,0,-14] に相対移動する", () => {
  const context = buildActiveContext([int(0), int(-14)]);
  const result = tdLeadingHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textState.leading).toBe(14);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -14),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -14),
  );
});

test("'-30 -14 TD' で tx は反転せず matrix に -30 が入り、leading は ty のみ反転して 14 になる", () => {
  const context = buildActiveContext([int(-30), int(-14)]);
  const result = tdLeadingHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  // tx=-30 は反転されず matrix[4]（e）にそのまま、ty=-14 も matrix[5]（f）にそのまま。
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, -30, -14),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, -30, -14),
  );
  // leading は ty のみ反転（-ty = 14）。tx(-30) には一切依存しない。
  expect(current.textState.leading).toBe(14);
});

test("'72 720 TD' の後 '0 -14 TD' で両 matrix が [1,0,0,1,72,706] に累積し leading が 14 に更新される", () => {
  const first = tdLeadingHandler(buildActiveContext([int(72), int(720)]));
  assert(first.ok);

  const firstObject = GraphicsStateStack.current(
    first.value.graphicsStateStack,
  ).textObject;
  const second = tdLeadingHandler(
    buildActiveContext([int(0), int(-14)], firstObject),
  );

  assert(second.ok);
  const current = GraphicsStateStack.current(second.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 72, 706),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 72, 706),
  );
  expect(current.textState.leading).toBe(14);
});

test("integer / real 混在 operand で matrix に 720.5 が入り leading=-720.5 になる", () => {
  const context = buildActiveContext([int(72), real(720.5)]);
  const result = tdLeadingHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 72, 720.5),
  );
  expect(current.textState.leading).toBe(-720.5);
});

test("integer / real 混在の逆方向（tx=real / ty=integer）でも matrix に 72.5 が入り leading=-720 になる", () => {
  // tx 位置に real / ty 位置に integer を渡し、型ガードが tx・ty どちらの位置でも
  // integer/real を等価に受理することを pin down する（順方向との対称性の固定）。
  const context = buildActiveContext([real(72.5), int(720)]);
  const result = tdLeadingHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 72.5, 720),
  );
  expect(current.textState.leading).toBe(-720);
});

test("成功時に text object は active のまま維持される", () => {
  const context = buildActiveContext([int(72), int(720)]);
  const result = tdLeadingHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(TextObject.isActive(current.textObject)).toBe(true);
});

test("成功時に operandStack は同一参照で返り depth が 0 になる", () => {
  const context = buildActiveContext([int(72), int(720)]);
  const result = tdLeadingHandler(context);

  assert(result.ok);
  expect(result.value.operandStack).toBe(context.operandStack);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("余剰 operand があっても末尾 2 個のみ pop し残り 1 個を保持する", () => {
  const context = buildActiveContext([int(99), int(5), int(7)]);
  const result = tdLeadingHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 5, 7),
  );
  expect(current.textState.leading).toBe(-7);
  expect(OperandStack.depth(result.value.operandStack)).toBe(1);
});

test.each<[string, PdfObject, number]>([
  ["+Infinity", real(Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY],
  ["-Infinity", real(Number.NEGATIVE_INFINITY), Number.NEGATIVE_INFINITY],
  ["負値", real(-3.5), -3.5],
  ["小数", real(1.25), 1.25],
  ["0", int(0), 0],
])("境界値 '%s' を ty に渡しても値域検証せず matrix にそのまま格納し leading は反転値になる", (_label, operand, expected) => {
  const context = buildActiveContext([int(10), operand]);
  const result = tdLeadingHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  // matrix[5]（f）には反転前の生 ty がそのまま入る。
  expect(current.textObject.textMatrix[5]).toBe(expected);
  // leading は ty のみ反転した値（-ty）。値域検証で弾かれない。
  expect(current.textState.leading).toBe(-expected);
});

test("境界値 NaN を ty に渡しても値域検証せず matrix・leading に NaN を格納する", () => {
  // NaN は toEqual / toBe の NaN 比較仕様に頼らず Number.isNaN で明示判定する。
  const context = buildActiveContext([int(10), real(Number.NaN)]);
  const result = tdLeadingHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(Number.isNaN(current.textObject.textMatrix[5])).toBe(true);
  expect(Number.isNaN(current.textState.leading)).toBe(true);
});
