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
import { apostropheHandler } from "../index";

// leading / textObject を仕込んだ active コンテキストを組むビルダ。
// テストヘルパは共通化せず各テストファイル内にローカル定義する規約（本 issue では
// 抽出をスコープ外とする方針）に従い、basic / error 間でも個別に定義する。
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

const hexString = (bytes: number[]): PdfObject => ({
  type: "string",
  value: new Uint8Array(bytes),
  encoding: "hex",
});

test("leading=14 の active context で string operand を受理し両 matrix が translate(0, -14) になる", () => {
  // `string '` ≡ `T* string Tj` の T* 部に相当する平行移動 (0, -leading) が適用されること
  const context = buildActiveContext([literalString([0x48, 0x69])], 14);

  const result = apostropheHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -14),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -14),
  );
  // operand は pop されて stack は空であること
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test('hex string operand（encoding: "hex"）も string として受理し同じ平行移動になる', () => {
  // tokenizer/parser が literal / hex を単一 type: "string" として渡す前提を pin down
  const context = buildActiveContext([hexString([0x48, 0x69])], 14);

  const result = apostropheHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -14),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -14),
  );
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("leading=14 のまま ' を 2 回連続実行すると f 成分が -28 に累積する", () => {
  // 連続 ' は Tlm への translate 乗算が累積する（三角測量 — 固定値実装の排除）
  const first = apostropheHandler(
    buildActiveContext([literalString([0x48])], 14),
  );
  assert(first.ok);

  const firstObject = GraphicsStateStack.current(
    first.value.graphicsStateStack,
  ).textObject;
  const second = apostropheHandler(
    buildActiveContext([literalString([0x69])], 14, firstObject),
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

test("operand stack に 2 つあるとき先頭 1 つだけ消費される", () => {
  // 余剰 operand が積まれていても、' は末尾 1 つだけ pop して残りは保持されること
  const remaining = literalString([0x41]);
  const consumed = literalString([0x42]);
  const context = buildActiveContext([remaining, consumed], 14);

  const result = apostropheHandler(context);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(1);
  const top = OperandStack.peek(result.value.operandStack);
  assert(top.some);
  expect(top.value).toEqual(remaining);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -14),
  );
});

test("leading=0（default）で ' を実行しても両 matrix は identity のまま（no-op 相当）", () => {
  // TextState.create() の default leading=0 では translate(0, 0) の no-op 相当になること
  const context = buildActiveContext([literalString([0x48])], 0);

  const result = apostropheHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(Matrix.identity());
  expect(current.textObject.textLineMatrix).toEqual(Matrix.identity());
  // operand は pop 済みであること
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("leading=0・dirty state（Tm≠Tlm）で ' を実行すると Tlm は不変・Tm が Tlm にリセットされる", () => {
  // translateLine(0, 0) は Tlm 不変だが Tm を Tlm に揃える。「matrix 不変」は
  // begin 直後の文脈でのみ正確であり、dirty state ではリセットが起きることを pin down する
  const dirtyTm = Matrix.create(5, 0, 0, 5, 1, 2);
  const lineTlm = Matrix.create(1, 0, 0, 1, 72, 720);
  const context = buildActiveContext(
    [literalString([0x48])],
    0,
    buildDirtyTextObject(dirtyTm, lineTlm),
  );

  const result = apostropheHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  // Tlm は不変であること
  expect(current.textObject.textLineMatrix).toEqual(lineTlm);
  // Tm は Tlm と同値にリセットされること
  expect(current.textObject.textMatrix).toEqual(lineTlm);
});

test("負の leading=-5 で ' を実行すると上方向 translate(0, 5) に移動する", () => {
  // leading の符号反転（-leading）により負の leading は上方向移動になること
  // handler 側で値域検証しない規約を pin down
  const context = buildActiveContext([literalString([0x48])], -5);

  const result = apostropheHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, 5),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, 5),
  );
});

test("leading=NaN を素通しで受け取り matrix の f 成分が NaN になる", () => {
  // 値域検証なし規約に従い、translateLine が NaN を素通しすること
  const context = buildActiveContext([literalString([0x48])], Number.NaN);

  const result = apostropheHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(Number.isNaN(current.textObject.textMatrix[5])).toBe(true);
  expect(Number.isNaN(current.textObject.textLineMatrix[5])).toBe(true);
});

test("leading=Infinity を素通しで受け取り matrix の f 成分が -Infinity になる", () => {
  // 値域検証なし規約に従い、-leading の符号反転だけが行われること
  const context = buildActiveContext(
    [literalString([0x48])],
    Number.POSITIVE_INFINITY,
  );

  const result = apostropheHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix[5]).toBe(Number.NEGATIVE_INFINITY);
  expect(current.textObject.textLineMatrix[5]).toBe(Number.NEGATIVE_INFINITY);
});

test("成功時に operandStack は入力と同一参照で返る（in-place mutate）", () => {
  // OperandStack.pop は in-place mutate のため、handler は新しい stack を作らず
  // 入力の operand stack をそのまま（pop 済みで）返すこと
  const context = buildActiveContext([literalString([0x48])], 14);

  const result = apostropheHandler(context);

  assert(result.ok);
  expect(result.value.operandStack).toBe(context.operandStack);
});

test("leading=0 でも成功時に graphicsStateStack は入力と異なる新規参照で返る", () => {
  // translate が no-op 相当でも replaceCurrent は必ず呼ばれるため、
  // stack 自体は新インスタンスになること（同一参照ではない）
  const context = buildActiveContext([literalString([0x48])], 0);

  const result = apostropheHandler(context);

  assert(result.ok);
  expect(result.value.graphicsStateStack).not.toBe(context.graphicsStateStack);
});
