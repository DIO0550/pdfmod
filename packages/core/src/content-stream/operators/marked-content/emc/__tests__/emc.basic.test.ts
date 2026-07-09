import { assert, expect, test } from "vitest";
import type {
  PdfName,
  PdfObject,
} from "../../../../../pdf/types/pdf-types/index";
import { none } from "../../../../../utils/option/index";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import type { MarkedContentEntry } from "../../../../marked-content/stack/index";
import { MarkedContentStack } from "../../../../marked-content/stack/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { emcHandler } from "../index";

/**
 * EMC handler 呼び出し用の context を生成する。
 * markedContentStack へ tags を LIFO 順（配列先頭が最外）で push し、
 * operand stack へ operands を積んだ状態で返す。
 */
const buildContext = (
  tags: readonly PdfName[],
  operands: readonly PdfObject[] = [],
): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  let markedContentStack = MarkedContentStack.create();
  for (const tag of tags) {
    const entry: MarkedContentEntry = { tag, properties: none };
    markedContentStack = MarkedContentStack.push(markedContentStack, entry);
  }
  return {
    operandStack,
    graphicsStateStack: GraphicsStateStack.create(),
    markedContentStack,
  };
};

test("depth=1 の stack を pop すると ok を返す", () => {
  const ctx = buildContext([{ type: "name", value: "Span" }]);

  const result = emcHandler(ctx);

  assert(result.ok);
});

test("成功時に markedContentStack の depth が 1 → 0 になる", () => {
  const ctx = buildContext([{ type: "name", value: "Span" }]);

  const result = emcHandler(ctx);

  assert(result.ok);
  expect(MarkedContentStack.depth(result.value.markedContentStack)).toBe(0);
});

test("成功時に markedContentStack は入力と別参照で返る", () => {
  const ctx = buildContext([{ type: "name", value: "Span" }]);

  const result = emcHandler(ctx);

  assert(result.ok);
  expect(result.value.markedContentStack).not.toBe(ctx.markedContentStack);
});

test("成功後も入力 ctx.markedContentStack は非破壊で depth=1 のまま", () => {
  const ctx = buildContext([{ type: "name", value: "Span" }]);

  const result = emcHandler(ctx);

  assert(result.ok);
  expect(MarkedContentStack.depth(ctx.markedContentStack)).toBe(1);
});

test("成功時に operandStack は入力と同一参照で返る", () => {
  const ctx = buildContext([{ type: "name", value: "Span" }]);

  const result = emcHandler(ctx);

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
});

test("成功時に graphicsStateStack は入力と同一参照で返る", () => {
  const ctx = buildContext([{ type: "name", value: "Span" }]);

  const result = emcHandler(ctx);

  assert(result.ok);
  expect(result.value.graphicsStateStack).toBe(ctx.graphicsStateStack);
});

test("余剰 operand があっても消費しない（operandStack 同一参照・depth 不変）", () => {
  const ctx = buildContext(
    [{ type: "name", value: "Span" }],
    [
      { type: "integer", value: 1 },
      { type: "integer", value: 2 },
    ],
  );

  const result = emcHandler(ctx);

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
  expect(OperandStack.depth(result.value.operandStack)).toBe(2);
});

test("ネスト（depth=2）を pop すると depth=1 になり残る tag は外側（LIFO）", () => {
  const outer: PdfName = { type: "name", value: "Outer" };
  const inner: PdfName = { type: "name", value: "Inner" };
  const ctx = buildContext([outer, inner]);

  const result = emcHandler(ctx);

  assert(result.ok);
  expect(MarkedContentStack.depth(result.value.markedContentStack)).toBe(1);
  const remaining = MarkedContentStack.pop(result.value.markedContentStack);
  assert(remaining.some);
  expect(remaining.value.popped.tag).toEqual(outer);
});
