import { assert, expect, test } from "vitest";
import {
  GraphicsState,
  GraphicsStateStack,
  Matrix,
  TextObject,
} from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { etHandler } from "../index";

// active な context を組むビルダ（btHandler ではなく TextObject.begin() で直接構築）
const buildActiveContext = (): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
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

test("active な state で ET を実行すると textObject.active が false へ遷移する", () => {
  // BT 済み（active）の context に ET を適用すると text object が終了する
  const ctx = buildActiveContext();

  const result = etHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(TextObject.isActive(current.textObject)).toBe(false);
});

test("ET 実行後 textMatrix が identity にリセットされる", () => {
  // ET は TextObject.end 経由で textMatrix を identity に戻す
  const ctx = buildActiveContext();

  const result = etHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(Matrix.identity());
});

test("ET 実行後 textLineMatrix が identity にリセットされる", () => {
  // ET は TextObject.end 経由で textLineMatrix を identity に戻す
  const ctx = buildActiveContext();

  const result = etHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textLineMatrix).toEqual(Matrix.identity());
});

test("ET は textObject 以外の graphics state（ctm / lineWidth）を変更しない", () => {
  // ET が触れるのは textObject のみで、他の graphics state は不変
  const ctx = buildActiveContext();
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = etHandler(ctx);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.ctm).toEqual(before.ctm);
  expect(after.lineWidth).toBe(before.lineWidth);
});

test("ET は operand stack を消費せず同一参照のまま返す", () => {
  // ET は引数を取らないため operand stack を pop / 差し替えしない
  const ctx = buildActiveContext();

  const result = etHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
  expect(result.value.operandStack).toBe(ctx.operandStack);
});
