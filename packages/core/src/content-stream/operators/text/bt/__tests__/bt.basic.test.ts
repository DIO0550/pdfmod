import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  GraphicsStateStack,
  Matrix,
  TextObject,
} from "../../../../graphics-state/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { btHandler } from "../index";

const real = (value: number): PdfObject => ({ type: "real", value });

// inactive な初期 GraphicsState を持つ context を組み立てる（h.basic.test.ts と同形）
const buildContext = (operands: PdfObject[] = []): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const graphicsStateStack = GraphicsStateStack.create();
  return { operandStack, graphicsStateStack };
};

test("初期 inactive 状態で BT を実行すると textObject.active が true へ遷移する", () => {
  const ctx = buildContext();

  const result = btHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(TextObject.isActive(current.textObject)).toBe(true);
});

test("BT 成功時 textMatrix / textLineMatrix が identity に初期化される", () => {
  const ctx = buildContext();

  const result = btHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textObject.textMatrix).toEqual(Matrix.identity());
  expect(current.textObject.textLineMatrix).toEqual(Matrix.identity());
});

test("BT は textObject 以外の graphics state（ctm / lineWidth）を変更しない", () => {
  const ctx = buildContext();
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = btHandler(ctx);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.ctm).toEqual(before.ctm);
  expect(after.lineWidth).toBe(before.lineWidth);
});

test("operand stack が空でも BT は成功し、空・同一参照のまま返る", () => {
  const ctx = buildContext();

  const result = btHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
  expect(result.value.operandStack).toBe(ctx.operandStack);
});

test("operand stack に余剰要素があっても BT は pop しない（depth 不変・同一参照）", () => {
  const ctx = buildContext([real(1), real(2), real(3)]);
  const depthBefore = OperandStack.depth(ctx.operandStack);

  const result = btHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(depthBefore);
  expect(result.value.operandStack).toBe(ctx.operandStack);
});
