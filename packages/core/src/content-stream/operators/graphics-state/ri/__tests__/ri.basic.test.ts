import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { riHandler } from "../index";

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

test.each([
  "AbsoluteColorimetric",
  "RelativeColorimetric",
  "Saturation",
  "Perceptual",
  "CustomRenderingIntent",
])("name operand %s で current renderingIntent が更新される", (name) => {
  const ctx = buildContext([{ type: "name", value: name }]);

  const result = riHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.renderingIntent).toBe(name);
});

test("operand stack に複数要素がある場合、成功時は末尾 1 つだけ pop し残りはそのまま", () => {
  const head: PdfObject = { type: "integer", value: 99 };
  const tail: PdfObject = { type: "name", value: "AbsoluteColorimetric" };
  const ctx = buildContext([head, tail]);

  const result = riHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(1);
  const top = OperandStack.peek(result.value.operandStack);
  assert(top.some);
  expect(top.value).toEqual(head);
});

test("renderingIntent 更新後も他の GraphicsState フィールドは不変", () => {
  const ctx = buildContext([{ type: "name", value: "Perceptual" }]);
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = riHandler(ctx);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.lineWidth).toBe(before.lineWidth);
  expect(after.lineCap).toBe(before.lineCap);
  expect(after.flatness).toBe(before.flatness);
  expect(after.ctm).toEqual(before.ctm);
});
