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
import { tStarHandler } from "../index";

// leading / textObject を仕込んだ active コンテキストを組むビルダ。
// （td-leading.basic.test.ts の buildActiveContext を leading 注入可能に拡張）
const buildActiveContext = (
  operands: PdfObject[],
  leading: number,
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
// text-object.positioning.test.ts の buildActive と同一の確立パターン。
const buildDirtyTextObject = (
  textMatrix: Matrix,
  textLineMatrix: Matrix,
): TextObject =>
  ({
    active: true,
    textMatrix,
    textLineMatrix,
  }) as unknown as TextObject;

const int = (value: number): PdfObject => ({ type: "integer", value });

test("leading=14 で T* を実行すると両 matrix が translate(0, -14) になる", () => {
  // BT 直後（Tm=Tlm=identity）に TL 14 相当の leading が設定された状態で
  // T* が 0 -TL Td 相当の行送り（0, -14）を適用すること
  const context = buildActiveContext([], 14);

  const result = tStarHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -14),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -14),
  );
});

test("leading=14 のまま T* を 2 回連続実行すると f 成分が -28 に累積する", () => {
  // 連続 T* は Tlm への translate 乗算が累積する（三角測量 — 固定値実装の排除）
  const first = tStarHandler(buildActiveContext([], 14));
  assert(first.ok);

  const firstObject = GraphicsStateStack.current(
    first.value.graphicsStateStack,
  ).textObject;
  const second = tStarHandler(buildActiveContext([], 14, firstObject));

  assert(second.ok);
  const current = GraphicsStateStack.current(second.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -28),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -28),
  );
});

test("負の leading=-10 で T* を実行すると上方向 translate(0, 10) に移動する", () => {
  // leading の符号反転（-leading）により負の leading は上方向移動になること
  const context = buildActiveContext([], -10);

  const result = tStarHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, 10),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, 10),
  );
});

test("Tm=Tlm=[1,0,0,1,72,720] の起点から leading=14 の T* で f 成分が 706 になる", () => {
  // Tlm 非 identity 起点でも translate(0, -TL) × Tlm の乗算方向で累積すること（回帰検出）
  const origin = Matrix.create(1, 0, 0, 1, 72, 720);
  const context = buildActiveContext(
    [],
    14,
    buildDirtyTextObject(origin, origin),
  );

  const result = tStarHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 72, 706),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 72, 706),
  );
});

test("成功時に operandStack は同一参照で返る", () => {
  // T* は operand を取らないため operand stack に一切触れず同一参照のまま返すこと
  const context = buildActiveContext([], 14);

  const result = tStarHandler(context);

  assert(result.ok);
  expect(result.value.operandStack).toBe(context.operandStack);
});

test("成功時に text object は active のまま維持される", () => {
  // translateLine が active を引き継ぐため T* 後も text object が閉じないこと
  const context = buildActiveContext([], 14);

  const result = tStarHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(TextObject.isActive(current.textObject)).toBe(true);
});

test("成功時に textState の leading は更新されず実行前と同値のまま", () => {
  // TD と異なり T* は leading を参照するのみで textState を更新しないこと（差分仕様の pin down）
  const context = buildActiveContext([], 14);

  const result = tStarHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textState.leading).toBe(14);
});

test("成功時、渡した context 側の graphics state は変更されない（不変更新）", () => {
  // mutate ではなく新インスタンス生成で更新するため、実行前の current は不変であり、
  // 入力スタック自体も差し替えられず新スタックのみが更新されること
  const context = buildActiveContext([], 14);
  const currentBefore = GraphicsStateStack.current(context.graphicsStateStack);

  const result = tStarHandler(context);

  assert(result.ok);
  expect(currentBefore.textObject.textMatrix).toEqual(Matrix.identity());
  expect(currentBefore.textObject.textLineMatrix).toEqual(Matrix.identity());
  // 実行後も入力スタックの current は実行前のインスタンスのまま（スタック自体が mutate されていない）
  expect(GraphicsStateStack.current(context.graphicsStateStack)).toBe(
    currentBefore,
  );
  // 返却されたスタックは入力スタックとは別の新インスタンスであること
  expect(result.value.graphicsStateStack).not.toBe(context.graphicsStateStack);
});

test("leading=0（default）・begin 直後で T* を実行しても両 matrix は identity のまま", () => {
  // TextState.create() の default leading=0 では translate(0, 0) の no-op 相当になること
  const context = buildActiveContext([], 0);

  const result = tStarHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(Matrix.identity());
  expect(current.textObject.textLineMatrix).toEqual(Matrix.identity());
});

test("leading=0・dirty state（Tm≠Tlm）で T* を実行すると Tlm は不変・Tm が Tlm にリセットされる", () => {
  // translateLine(0, 0) は Tlm 不変だが Tm を Tlm に揃える。「matrix 不変」は
  // begin 直後の文脈でのみ正確であり、dirty state ではリセットが起きることを T* レベルで pin down する
  const dirtyTm = Matrix.create(5, 0, 0, 5, 1, 2);
  const lineTlm = Matrix.create(1, 0, 0, 1, 72, 720);
  const context = buildActiveContext(
    [],
    0,
    buildDirtyTextObject(dirtyTm, lineTlm),
  );

  const result = tStarHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  // Tlm は不変であること
  expect(current.textObject.textLineMatrix).toEqual(lineTlm);
  // Tm は Tlm と同値にリセットされること
  expect(current.textObject.textMatrix).toEqual(lineTlm);
});

test("operand stack に余剰要素があっても pop せず行送りは通常どおり成功する", () => {
  // T* は operand を取らないため、余剰要素は depth 不変・スタック先頭もそのままで
  // graphics state の更新だけが行われること
  const context = buildActiveContext([int(99), int(7)], 14);

  const result = tStarHandler(context);

  assert(result.ok);
  expect(result.value.operandStack).toBe(context.operandStack);
  expect(OperandStack.depth(result.value.operandStack)).toBe(2);
  const top = OperandStack.peek(result.value.operandStack);
  assert(top.some);
  expect(top.value).toEqual(int(7));
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -14),
  );
});
