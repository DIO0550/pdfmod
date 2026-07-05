import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  GraphicsState,
  GraphicsStateStack,
  TextObject,
} from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { doHandler } from "../index";

// inactive な textObject（GraphicsStateStack.create() 直後）でビルド
const buildContext = (operands: PdfObject[]): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const graphicsStateStack = GraphicsStateStack.create();
  return {
    operandStack,
    graphicsStateStack,
    markedContentStack: MarkedContentStack.create(),
  };
};

// active な textObject（BT 後相当）に差し替えてビルド
const buildActiveContext = (operands: PdfObject[]): OperatorHandlerContext => {
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
  return {
    operandStack,
    graphicsStateStack,
    markedContentStack: MarkedContentStack.create(),
  };
};

test("name { type: 'name', value: 'Im1' } を受理し ok を返す", () => {
  const ctx = buildContext([{ type: "name", value: "Im1" }]);

  const result = doHandler(ctx);

  assert(result.ok);
});

test("成功時に operandStack は入力と同一参照で返る（in-place mutate）", () => {
  const ctx = buildContext([{ type: "name", value: "Im1" }]);

  const result = doHandler(ctx);

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
});

test("成功時に graphicsStateStack は入力と同一参照で返る", () => {
  const ctx = buildContext([{ type: "name", value: "Im1" }]);

  const result = doHandler(ctx);

  assert(result.ok);
  expect(result.value.graphicsStateStack).toBe(ctx.graphicsStateStack);
});

test("成功時に operand が 1 個消費され depth=0 になる", () => {
  const ctx = buildContext([{ type: "name", value: "Im1" }]);

  const result = doHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("余剰 operand があれば末尾 1 個のみ消費する（depth=3 → depth=2）", () => {
  const surplus0: PdfObject = { type: "integer", value: 1 };
  const surplus1: PdfObject = { type: "integer", value: 2 };
  const ctx = buildContext([
    surplus0,
    surplus1,
    { type: "name", value: "Im1" },
  ]);

  const result = doHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(2);
  const top = OperandStack.peek(result.value.operandStack);
  assert(top.some);
  expect(top.value).toEqual(surplus1);
});

test("name 値が空文字 ('') でも受理する（値域検証なし pin down）", () => {
  const ctx = buildContext([{ type: "name", value: "" }]);

  const result = doHandler(ctx);

  assert(result.ok);
});

test("inactive な textObject でも ok を返す（active 検査なし pin down）", () => {
  const ctx = buildContext([{ type: "name", value: "Im1" }]);

  const result = doHandler(ctx);

  assert(result.ok);
});

test("active な textObject でも ok を返す（BT/ET 内対称、active 検査なし pin down）", () => {
  const ctx = buildActiveContext([{ type: "name", value: "Im1" }]);

  const result = doHandler(ctx);

  assert(result.ok);
});

test("成功時に graphics state stack の current は完全に不変", () => {
  const ctx = buildActiveContext([{ type: "name", value: "Im1" }]);
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = doHandler(ctx);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after).toBe(before);
  expect(after.textState).toBe(before.textState);
  expect(after.textObject).toBe(before.textObject);
});
