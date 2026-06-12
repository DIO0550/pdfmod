import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  GraphicsState,
  GraphicsStateStack,
  Matrix,
  TextObject,
  TextState,
} from "../../../../graphics-state/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { tStarHandler } from "../index";

// text object が inactive なコンテキストを operand 付きで組むビルダ。
// （default の GraphicsStateStack.create() は textObject 非 active）
const buildInactiveContext = (
  operands: PdfObject[] = [],
): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const graphicsStateStack = GraphicsStateStack.create();
  return { operandStack, graphicsStateStack };
};

const int = (value: number): PdfObject => ({ type: "integer", value });

// inactive (active=false) かつ matrix が非 identity・leading が非 default の context。
// et.error.test.ts の buildInactiveNonIdentityContext と同一の生リテラル構築パターン。
// ガードを通らず translateLine が誤って呼ばれた場合に matrix が変化することを検出するための fixture。
const NON_IDENTITY_MATRIX = Matrix.create(2, 0, 0, 2, 10, 20);
const buildInactiveNonIdentityContext = (): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  const inactiveNonIdentity = {
    active: false,
    textMatrix: NON_IDENTITY_MATRIX,
    textLineMatrix: NON_IDENTITY_MATRIX,
  } as unknown as TextObject;
  const state = GraphicsState.update(GraphicsState.create(), {
    textObject: inactiveNonIdentity,
    textState: TextState.update(TextState.create(), { leading: 14 }),
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    GraphicsStateStack.create(),
    state,
  );
  return { operandStack, graphicsStateStack };
};

test("inactive な state で T* を実行すると OPERATOR_ILLEGAL_STATE を返す", () => {
  // BT/ET の外（textObject 非 active）で T* が出現したとき illegal state として失敗すること
  const context = buildInactiveContext();

  const result = tStarHandler(context);

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_ILLEGAL_STATE");
});

test("inactive な state で T* を実行したときエラーの operatorName が T* である", () => {
  // エラーに反映される operator 名が PDF 表記の "T*" であること
  const context = buildInactiveContext();

  const result = tStarHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ILLEGAL_STATE");
  expect(result.error.operatorName).toBe("T*");
});

test("inactive な state で T* を実行したときエラーの message が BT/ET 外を示す", () => {
  // ユーザー向けに BT/ET 外であることを説明する固定メッセージを返すこと
  const context = buildInactiveContext();

  const result = tStarHandler(context);

  assert(!result.ok);
  expect(result.error.message).toBe(
    "T*: text object is not active (T* must appear within BT/ET)",
  );
});

test("エラー時 operand stack は変更されない（depth・内容とも実行前と同値）", () => {
  // エラー時は新 context が返らないため、渡した context.operandStack を直接検証する。
  // T* は operand を取らないため illegal state でも pop が一切起きないこと
  const context = buildInactiveContext([int(99), int(7)]);

  const result = tStarHandler(context);

  assert(!result.ok);
  expect(OperandStack.depth(context.operandStack)).toBe(2);
  const top = OperandStack.peek(context.operandStack);
  assert(top.some);
  expect(top.value).toEqual(int(7));
});

test("エラー時 graphics state stack は差し替えられず current が変更されない", () => {
  // ガードの early-return により replaceCurrent が呼ばれず、非 identity の matrix と
  // 非 default の textState（leading=14）がそのまま保持されること（et.error.test.ts パターン）
  const context = buildInactiveNonIdentityContext();
  const stackBefore = context.graphicsStateStack;

  const result = tStarHandler(context);

  assert(!result.ok);
  expect(context.graphicsStateStack).toBe(stackBefore);
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(NON_IDENTITY_MATRIX);
  expect(current.textObject.textLineMatrix).toEqual(NON_IDENTITY_MATRIX);
  expect(current.textState.leading).toBe(14);
  expect(TextObject.isActive(current.textObject)).toBe(false);
});
