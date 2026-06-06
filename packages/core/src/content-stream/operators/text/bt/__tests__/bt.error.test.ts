import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  GraphicsState,
  GraphicsStateStack,
  TextObject,
} from "../../../../graphics-state/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { btHandler } from "../index";

const real = (value: number): PdfObject => ({ type: "real", value });

// 既に active な textObject を持つ context を組み立てる（二重ネスト BT の再現）。
// operands を渡せば operand stack に積んだ状態を再現でき、エラー時の非 pop 検証に使える。
const buildActiveContext = (
  operands: PdfObject[] = [],
): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const activeState = GraphicsState.update(GraphicsState.create(), {
    textObject: TextObject.begin(),
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    GraphicsStateStack.create(),
    activeState,
  );
  return { operandStack, graphicsStateStack };
};

test("active=true の状態で BT を実行すると OPERATOR_ILLEGAL_STATE を返す", () => {
  const ctx = buildActiveContext();

  const result = btHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ILLEGAL_STATE");
  expect(result.error.operatorName).toBe("BT");
  expect(result.error.message).toBe(
    "BT: text object already active (nested BT/ET is not allowed)",
  );
});

test("エラー時 operand stack は pop されない（余剰要素があっても depth 不変・同一参照）", () => {
  const ctx = buildActiveContext([real(1), real(2)]);
  const operandStackBefore = ctx.operandStack;
  const depthBefore = OperandStack.depth(ctx.operandStack);

  const result = btHandler(ctx);

  assert(!result.ok);
  expect(ctx.operandStack).toBe(operandStackBefore);
  expect(OperandStack.depth(ctx.operandStack)).toBe(depthBefore);
  expect(OperandStack.depth(ctx.operandStack)).toBe(2);
});

test("エラー時 graphics state stack は差し替えられず textObject.active が true のまま", () => {
  const ctx = buildActiveContext();
  const stackBefore = ctx.graphicsStateStack;
  const currentBefore = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = btHandler(ctx);

  assert(!result.ok);
  // ハンドラは Err 経路で stack を replaceCurrent していない（入力 context が同一参照・同値のまま）
  expect(ctx.graphicsStateStack).toBe(stackBefore);
  const currentAfter = GraphicsStateStack.current(ctx.graphicsStateStack);
  expect(currentAfter).toEqual(currentBefore);
  expect(TextObject.isActive(currentAfter.textObject)).toBe(true);
});
