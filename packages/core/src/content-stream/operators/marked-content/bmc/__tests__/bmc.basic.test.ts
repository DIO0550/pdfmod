import { assert, expect, test } from "vitest";
import type {
  PdfName,
  PdfObject,
} from "../../../../../pdf/types/pdf-types/index";
import { none } from "../../../../../utils/option/index";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import type { MarkedContentEntry } from "../../../../marked-content/stack";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { bmcHandler } from "../index";

const buildContext = (operands: PdfObject[]): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  return {
    operandStack,
    graphicsStateStack: GraphicsStateStack.create(),
    markedContentStack: MarkedContentStack.create(),
  };
};

// markedContentStack を depth=1 の非空状態にして組み立てる（ネスト push 検証用）
const buildNestedContext = (
  operands: PdfObject[],
  seededTag: PdfName,
): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const seededEntry: MarkedContentEntry = { tag: seededTag, properties: none };
  return {
    operandStack,
    graphicsStateStack: GraphicsStateStack.create(),
    markedContentStack: MarkedContentStack.push(
      MarkedContentStack.create(),
      seededEntry,
    ),
  };
};

test("name { type: 'name', value: 'Span' } を受理し ok を返す", () => {
  const ctx = buildContext([{ type: "name", value: "Span" }]);

  const result = bmcHandler(ctx);

  assert(result.ok);
});

test("成功時に markedContentStack は入力と別参照で返る", () => {
  const ctx = buildContext([{ type: "name", value: "Span" }]);

  const result = bmcHandler(ctx);

  assert(result.ok);
  expect(result.value.markedContentStack).not.toBe(ctx.markedContentStack);
});

test("成功時に markedContentStack の depth が 0 → 1 になる", () => {
  const ctx = buildContext([{ type: "name", value: "Span" }]);

  const result = bmcHandler(ctx);

  assert(result.ok);
  expect(MarkedContentStack.depth(result.value.markedContentStack)).toBe(1);
});

test("成功後も入力 ctx.markedContentStack は非破壊で depth=0 のまま", () => {
  const ctx = buildContext([{ type: "name", value: "Span" }]);

  const result = bmcHandler(ctx);

  assert(result.ok);
  expect(MarkedContentStack.depth(ctx.markedContentStack)).toBe(0);
});

test("push された entry の tag は pop した Name と一致し properties は none", () => {
  const tag: PdfName = { type: "name", value: "Span" };
  const ctx = buildContext([tag]);

  const result = bmcHandler(ctx);

  assert(result.ok);
  const popped = MarkedContentStack.pop(result.value.markedContentStack);
  assert(popped.some);
  expect(popped.value.popped.tag).toEqual(tag);
  expect(popped.value.popped.properties.some).toBe(false);
});

test("成功時に operandStack は入力と同一参照で返る（in-place mutate）", () => {
  const ctx = buildContext([{ type: "name", value: "Span" }]);

  const result = bmcHandler(ctx);

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
});

test("成功時に operand が 1 個消費され operandStack の depth=0 になる", () => {
  const ctx = buildContext([{ type: "name", value: "Span" }]);

  const result = bmcHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("余剰 operand があるとき末尾 1 個のみ消費する（depth=3 → depth=2）", () => {
  const surplus0: PdfObject = { type: "integer", value: 1 };
  const surplus1: PdfObject = { type: "integer", value: 2 };
  const ctx = buildContext([
    surplus0,
    surplus1,
    { type: "name", value: "Span" },
  ]);

  const result = bmcHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(2);
  const top = OperandStack.peek(result.value.operandStack);
  assert(top.some);
  expect(top.value).toEqual(surplus1);
});

test("成功時に graphicsStateStack は入力と同一参照で返る", () => {
  const ctx = buildContext([{ type: "name", value: "Span" }]);

  const result = bmcHandler(ctx);

  assert(result.ok);
  expect(result.value.graphicsStateStack).toBe(ctx.graphicsStateStack);
});

test("既存の非空 stack（depth=1）へネスト push すると depth=2 になる", () => {
  const seededTag: PdfName = { type: "name", value: "Artifact" };
  const ctx = buildNestedContext([{ type: "name", value: "Span" }], seededTag);

  const result = bmcHandler(ctx);

  assert(result.ok);
  expect(MarkedContentStack.depth(result.value.markedContentStack)).toBe(2);
});

test("name 値が空文字 ('') でも受理する（値域検証なし pin down）", () => {
  const ctx = buildContext([{ type: "name", value: "" }]);

  const result = bmcHandler(ctx);

  assert(result.ok);
});
