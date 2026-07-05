import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { tfHandler } from "../index";

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

test("/F1 12 Tf で fontName=some('F1'), fontSize=12 に更新される", () => {
  const ctx = buildContext([
    { type: "name", value: "F1" },
    { type: "integer", value: 12 },
  ]);

  const result = tfHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  assert(current.textState.fontName.some);
  expect(current.textState.fontName.value).toBe("F1");
  expect(current.textState.fontSize).toBe(12);
});

test("size が real(10.5) でも fontName=some('F2'), fontSize=10.5 に更新される", () => {
  const ctx = buildContext([
    { type: "name", value: "F2" },
    { type: "real", value: 10.5 },
  ]);

  const result = tfHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  assert(current.textState.fontName.some);
  expect(current.textState.fontName.value).toBe("F2");
  expect(current.textState.fontSize).toBe(10.5);
});

test("font 値が空文字でも fontName=some('') に更新される", () => {
  const ctx = buildContext([
    { type: "name", value: "" },
    { type: "integer", value: 12 },
  ]);

  const result = tfHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  assert(current.textState.fontName.some);
  expect(current.textState.fontName.value).toBe("");
});

test("fontName/fontSize 更新後も textState の他フィールドは不変", () => {
  const ctx = buildContext([
    { type: "name", value: "F1" },
    { type: "integer", value: 12 },
  ]);
  const before = GraphicsStateStack.current(ctx.graphicsStateStack).textState;

  const result = tfHandler(ctx);

  assert(result.ok);
  const after = GraphicsStateStack.current(
    result.value.graphicsStateStack,
  ).textState;
  expect(after.charSpace).toBe(before.charSpace);
  expect(after.wordSpace).toBe(before.wordSpace);
  expect(after.horizontalScaling).toBe(before.horizontalScaling);
  expect(after.leading).toBe(before.leading);
  expect(after.renderingMode).toBe(before.renderingMode);
  expect(after.rise).toBe(before.rise);
});

test("成功時に operand が 2 個とも消費され depth が 0 になる", () => {
  const ctx = buildContext([
    { type: "name", value: "F1" },
    { type: "integer", value: 12 },
  ]);

  const result = tfHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("余剰 operand は残り、Tf は末尾 2 個のみ消費する", () => {
  const surplus: PdfObject = { type: "integer", value: 99 };
  const ctx = buildContext([
    surplus,
    { type: "name", value: "F1" },
    { type: "integer", value: 12 },
  ]);

  const result = tfHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(1);
  const top = OperandStack.peek(result.value.operandStack);
  assert(top.some);
  expect(top.value).toEqual(surplus);
});
