import { assert, expect, test } from "vitest";
import {
  GraphicsState,
  GraphicsStateStack,
  Matrix,
  TextObject,
} from "../../../../graphics-state/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { etHandler } from "../index";

// inactive な初期 context を組むビルダ
const buildContext = (): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  const graphicsStateStack = GraphicsStateStack.create();
  return { operandStack, graphicsStateStack };
};

// inactive (active=false) かつ matrix が非 identity の textObject を持つ context。
// ガードを通らず end() が誤って呼ばれた場合に matrix が identity へ潰れることを検出するための fixture。
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
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    GraphicsStateStack.create(),
    state,
  );
  return { operandStack, graphicsStateStack };
};

test("inactive な state で ET を実行すると OPERATOR_ILLEGAL_STATE を返す", () => {
  // BT 未実行（inactive 初期）の context に ET を適用すると ET without BT として失敗する
  const ctx = buildContext();

  const result = etHandler(ctx);

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_ILLEGAL_STATE");
});

test("inactive な state で ET を実行したときエラーの operatorName が ET である", () => {
  // エラーに反映される operator 名が PDF 表記の "ET" であること
  const ctx = buildContext();

  const result = etHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ILLEGAL_STATE");
  expect(result.error.operatorName).toBe("ET");
});

test("inactive な state で ET を実行したときエラーの message が ET without BT を示す", () => {
  // ユーザー向けに BT 不在を説明する固定メッセージを返すこと
  const ctx = buildContext();

  const result = etHandler(ctx);

  assert(!result.ok);
  expect(result.error.message).toBe(
    "ET: no active text object (ET without BT)",
  );
});

test("エラー時 graphics state stack は差し替えられず current が変更されない", () => {
  // ガードの early-return により stack を replaceCurrent しない（同一参照・同値のまま）
  const ctx = buildContext();
  const stackBefore = ctx.graphicsStateStack;
  const currentBefore = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = etHandler(ctx);

  assert(!result.ok);
  expect(ctx.graphicsStateStack).toBe(stackBefore);
  const currentAfter = GraphicsStateStack.current(ctx.graphicsStateStack);
  expect(currentAfter).toEqual(currentBefore);
  expect(TextObject.isActive(currentAfter.textObject)).toBe(false);
});

test("inactive かつ非 identity の matrix を持つ state で ET → Err 時に textObject が変更されない", () => {
  // ガードを通らず TextObject.end() が誤って呼ばれれば matrix が identity に潰れるため、
  // 非 identity のまま保持されていることで end() 未実行（textObject 不変）を担保する
  const ctx = buildInactiveNonIdentityContext();

  const result = etHandler(ctx);

  assert(!result.ok);
  const current = GraphicsStateStack.current(ctx.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(NON_IDENTITY_MATRIX);
  expect(current.textObject.textLineMatrix).toEqual(NON_IDENTITY_MATRIX);
});
