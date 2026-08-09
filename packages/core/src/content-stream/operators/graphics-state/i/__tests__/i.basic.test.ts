import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { flatnessHandler } from "../index";

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

test("integer operand 5 で current flatness が 5 に更新される", () => {
  const ctx = buildContext([{ type: "integer", value: 5 }]);

  const result = flatnessHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.flatness).toBe(5);
});

test("real operand 0.5 で current flatness が 0.5 に更新される", () => {
  const ctx = buildContext([{ type: "real", value: 0.5 }]);

  const result = flatnessHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.flatness).toBe(0.5);
});

test.each([
  {
    label: "0",
    operand: { type: "integer", value: 0 } as PdfObject,
    expected: 0,
  },
  {
    label: "100",
    operand: { type: "integer", value: 100 } as PdfObject,
    expected: 100,
  },
  {
    label: "out of range (101)",
    operand: { type: "real", value: 101.5 } as PdfObject,
    expected: 101.5,
  },
  {
    label: "negative (-1.0)",
    operand: { type: "real", value: -1.0 } as PdfObject,
    expected: -1.0,
  },
])("境界値 $label の operand も handler では検証せずそのまま GraphicsState に格納する", ({
  operand,
  expected,
}) => {
  const ctx = buildContext([operand]);

  const result = flatnessHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.flatness).toBe(expected);
});

test("operand stack に複数要素がある場合、成功時は末尾 1 つだけ pop し残りはそのまま", () => {
  const head: PdfObject = { type: "integer", value: 99 };
  const tail: PdfObject = { type: "real", value: 2.0 };
  const ctx = buildContext([head, tail]);

  const result = flatnessHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(1);
  const top = OperandStack.peek(result.value.operandStack);
  assert(top.some);
  expect(top.value).toEqual(head);
});

test("flatness 更新後も他の GraphicsState フィールドは不変", () => {
  const ctx = buildContext([{ type: "real", value: 4.0 }]);
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = flatnessHandler(ctx);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.lineWidth).toBe(before.lineWidth);
  expect(after.renderingIntent).toBe(before.renderingIntent);
  expect(after.ctm).toEqual(before.ctm);
});
