import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  GraphicsState,
  GraphicsStateStack,
  Matrix,
  TextObject,
  TextState,
} from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { quoteHandler } from "../index";

// leading / textObject を仕込んだ active コンテキストを組むビルダ。
// テストヘルパは共通化せず各テストファイル内にローカル定義する規約（apostrophe と同型）。
const buildActiveContext = (
  operands: PdfObject[],
  leading: number = 0,
  textObject: TextObject = TextObject.begin(),
): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const activeState = GraphicsState.update(GraphicsState.create(), {
    textObject,
    textState: TextState.update(TextState.create(), { leading }),
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

// active かつ任意の Tm / Tlm を持つ TextObject を生で組むヘルパ（dirty state 構築用）。
// translateLine(0, 0) が「Tlm 不変・Tm を Tlm にリセット」する挙動を pin down するため、
// TextObject.begin() ではなく Tm ≠ Tlm な fixture を構築する必要がある。
const buildDirtyTextObject = (
  textMatrix: Matrix,
  textLineMatrix: Matrix,
): TextObject =>
  ({
    active: true,
    textMatrix,
    textLineMatrix,
  }) as unknown as TextObject;

const literalString = (bytes: number[]): PdfObject => ({
  type: "string",
  value: new Uint8Array(bytes),
  encoding: "literal",
});

const int = (value: number): PdfObject => ({ type: "integer", value });
const real = (value: number): PdfObject => ({ type: "real", value });

test("leading=14 の active context で aw=2 / ac=1 (integer) / string=literal を受理する", () => {
  // `aw ac string "` ≡ `aw Tw ac Tc string '` の代表ケース。
  // wordSpace/charSpace が更新され、両 matrix が translate(0, -leading) になること
  const context = buildActiveContext(
    [int(2), int(1), literalString([0x48, 0x69])],
    14,
  );

  const result = quoteHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textState.wordSpace).toBe(2);
  expect(current.textState.charSpace).toBe(1);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -14),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -14),
  );
  // 3 個 pop され stack は空であること
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test('" を 2 回連続実行すると f 成分が -2*leading に累積する（三角測量）', () => {
  // 連続 " は Tlm への translate 乗算が累積する（固定値実装の排除）
  const first = quoteHandler(
    buildActiveContext([int(2), int(1), literalString([0x48])], 14),
  );
  assert(first.ok);

  const firstObject = GraphicsStateStack.current(
    first.value.graphicsStateStack,
  ).textObject;
  const second = quoteHandler(
    buildActiveContext(
      [int(2), int(1), literalString([0x69])],
      14,
      firstObject,
    ),
  );

  assert(second.ok);
  const current = GraphicsStateStack.current(second.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -28),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -28),
  );
});

test("aw=real(2.5) + ac=integer(1) の混在を受理する", () => {
  // NumericPdfObject.is は integer/real を同一に扱う
  const context = buildActiveContext(
    [real(2.5), int(1), literalString([0x48])],
    14,
  );

  const result = quoteHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textState.wordSpace).toBe(2.5);
  expect(current.textState.charSpace).toBe(1);
});

test("aw=integer(2) + ac=real(0.5) の逆混在を受理する", () => {
  // 反対側の組み合わせでも整合すること
  const context = buildActiveContext(
    [int(2), real(0.5), literalString([0x48])],
    14,
  );

  const result = quoteHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textState.wordSpace).toBe(2);
  expect(current.textState.charSpace).toBe(0.5);
});

test("leading=0 + clean state で両 matrix が identity のまま（translate(0,0) は no-op 相当）", () => {
  // BT 直後 (clean state) + leading=0 では translateLine(0, 0) が no-op
  const context = buildActiveContext(
    [int(2), int(1), literalString([0x48])],
    0,
  );

  const result = quoteHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(Matrix.identity());
  expect(current.textObject.textLineMatrix).toEqual(Matrix.identity());
  expect(current.textState.wordSpace).toBe(2);
  expect(current.textState.charSpace).toBe(1);
});

test("leading=0 + dirty state（Tm ≠ Tlm）で Tlm 不変・Tm が Tlm にリセット", () => {
  // translateLine(0, 0) は Tlm 不変だが Tm を Tlm に揃える。apostrophe と同型。
  const dirtyTm = Matrix.create(5, 0, 0, 5, 1, 2);
  const lineTlm = Matrix.create(1, 0, 0, 1, 72, 720);
  const context = buildActiveContext(
    [int(2), int(1), literalString([0x48])],
    0,
    buildDirtyTextObject(dirtyTm, lineTlm),
  );

  const result = quoteHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textLineMatrix).toEqual(lineTlm);
  expect(current.textObject.textMatrix).toEqual(lineTlm);
  // wordSpace/charSpace は更新される
  expect(current.textState.wordSpace).toBe(2);
  expect(current.textState.charSpace).toBe(1);
});

test("leading=-3.5 のとき translate(0, 3.5) が適用される", () => {
  // 値域検証なし。`-leading` の符号反転だけが行われること
  const context = buildActiveContext(
    [int(2), int(1), literalString([0x48])],
    -3.5,
  );

  const result = quoteHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, 3.5),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, 3.5),
  );
});

test("string operand を受理しても textState の wordSpace/charSpace 以外と textObject の active 以外は変化しない", () => {
  // 描画機構未実装のため、副作用は spacing 更新と行送りのみ。
  // 他フィールド（leading, fontSize, horizontalScaling, renderingMode, rise）は不変
  const context = buildActiveContext(
    [int(2), int(1), literalString([0x48])],
    14,
  );
  const before = GraphicsStateStack.current(context.graphicsStateStack);

  const result = quoteHandler(context);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  // 不変フィールド
  expect(after.textState.leading).toBe(before.textState.leading);
  expect(after.textState.fontSize).toBe(before.textState.fontSize);
  expect(after.textState.horizontalScaling).toBe(
    before.textState.horizontalScaling,
  );
  expect(after.textState.renderingMode).toBe(before.textState.renderingMode);
  expect(after.textState.rise).toBe(before.textState.rise);
  expect(after.textState.fontName).toEqual(before.textState.fontName);
  // active は維持される
  expect(after.textObject.active).toBe(true);
});

test("operand 4 個 push 状態でも先頭 3 個のみ pop し残 1 個は stack に残る", () => {
  // dispatcher が誤って余剰 operand を残した状態 — quote は 3 個のみ消費
  const remaining = int(999);
  const context = buildActiveContext(
    [remaining, int(2), int(1), literalString([0x48])],
    14,
  );

  const result = quoteHandler(context);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(1);
  const top = OperandStack.peek(result.value.operandStack);
  assert(top.some);
  expect(top.value).toEqual(remaining);
});

test("実行後の textState.leading が更新前と同値（不変量）", () => {
  // Tc/Tw 更新が leading を汚さない pin down
  const inputLeading = 14;
  const context = buildActiveContext(
    [int(2), int(1), literalString([0x48])],
    inputLeading,
  );

  const result = quoteHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textState.leading).toBe(inputLeading);
});

test("aw=NaN, ac=Infinity を素通しで受け取る（値域検証なし）", () => {
  // apostrophe / Tc / Tw と同じく値域検証なし
  const context = buildActiveContext(
    [
      { type: "real", value: Number.NaN },
      { type: "real", value: Number.POSITIVE_INFINITY },
      literalString([0x48]),
    ],
    14,
  );

  const result = quoteHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(Number.isNaN(current.textState.wordSpace)).toBe(true);
  expect(current.textState.charSpace).toBe(Number.POSITIVE_INFINITY);
});

test("成功時に operandStack は入力と同一参照で返る（in-place mutate）", () => {
  // OperandStack.pop は in-place mutate のため、handler は新しい stack を作らず
  // 入力の operand stack をそのまま（pop 済みで）返すこと
  const context = buildActiveContext(
    [int(2), int(1), literalString([0x48])],
    14,
  );

  const result = quoteHandler(context);

  assert(result.ok);
  expect(result.value.operandStack).toBe(context.operandStack);
});

test("成功時に graphicsStateStack は入力と異なる新規参照で返る", () => {
  // replaceCurrent は必ず呼ばれるため、stack 自体は新インスタンスになること
  const context = buildActiveContext(
    [int(2), int(1), literalString([0x48])],
    14,
  );

  const result = quoteHandler(context);

  assert(result.ok);
  expect(result.value.graphicsStateStack).not.toBe(context.graphicsStateStack);
});
