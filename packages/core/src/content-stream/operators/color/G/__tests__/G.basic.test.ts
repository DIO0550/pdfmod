import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  Color,
  ColorSpace,
  GraphicsState,
  GraphicsStateStack,
} from "../../../../graphics-state/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { GHandler } from "../index";

const buildContext = (operands: PdfObject[]): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const graphicsStateStack = GraphicsStateStack.create();
  return { operandStack, graphicsStateStack };
};

const real = (value: number): PdfObject => ({ type: "real", value });
const int = (value: number): PdfObject => ({ type: "integer", value });

test("`0.5 G` で strokeColor が Color.gray(0.5) に更新される", () => {
  const ctx = buildContext([real(0.5)]);

  const result = GHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.strokeColor).toEqual(Color.gray(0.5));
});

test("初期 strokeColorSpace=deviceRGB/strokeColor=rgb の状態から `0.5 G` で deviceGray + gray(0.5) に切り替わる", () => {
  const operandStack = OperandStack.create();
  OperandStack.push(operandStack, real(0.5));
  const baseStack = GraphicsStateStack.create();
  const base = GraphicsStateStack.current(baseStack);
  const rgbState = GraphicsState.update(base, {
    strokeColor: Color.rgb(1, 0, 0),
    strokeColorSpace: ColorSpace.deviceRGB(),
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    baseStack,
    rgbState,
  );

  const result = GHandler({ operandStack, graphicsStateStack });

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.strokeColor).toEqual(Color.gray(0.5));
  expect(current.strokeColorSpace).toEqual(ColorSpace.deviceGray());
});

test("integer operand `1 G` でも Color.gray(1) になる", () => {
  const ctx = buildContext([int(1)]);

  const result = GHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.strokeColor).toEqual(Color.gray(1));
});

test("成功時 fillColor / fillColorSpace は不変", () => {
  const ctx = buildContext([real(0.5)]);
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = GHandler(ctx);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.fillColor).toEqual(before.fillColor);
  expect(after.fillColorSpace).toEqual(before.fillColorSpace);
});

test("成功時 ctm / lineWidth / lineCap / lineJoin / miterLimit / currentPath は不変", () => {
  const ctx = buildContext([real(0.5)]);
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = GHandler(ctx);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.ctm).toEqual(before.ctm);
  expect(after.lineWidth).toBe(before.lineWidth);
  expect(after.lineCap).toBe(before.lineCap);
  expect(after.lineJoin).toBe(before.lineJoin);
  expect(after.miterLimit).toBe(before.miterLimit);
  expect(after.currentPath).toEqual(before.currentPath);
});

test("成功時 pop で operand stack が空になる (depth 0)", () => {
  const ctx = buildContext([real(0.5)]);

  const result = GHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("成功時 result.value.operandStack は context.operandStack と同一参照", () => {
  const ctx = buildContext([real(0.5)]);

  const result = GHandler(ctx);

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
});

test("operand stack に余剰要素がある場合、末尾 1 個だけ pop し残りはそのまま", () => {
  const head = int(99);
  const ctx = buildContext([head, real(0.5)]);

  const result = GHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.strokeColor).toEqual(Color.gray(0.5));
  expect(OperandStack.depth(result.value.operandStack)).toBe(1);
  const top = OperandStack.peek(result.value.operandStack);
  assert(top.some);
  expect(top.value).toEqual(head);
});

test("operand 0 個のとき OPERATOR_OPERAND_MISSING を返し actual = 0", () => {
  const ctx = buildContext([]);

  const result = GHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("G");
  expect(result.error.required).toBe(1);
  expect(result.error.actual).toBe(0);
  expect(result.error.message).toBe(
    "Operator 'G' requires 1 operand(s), got 0",
  );
});

test.each([
  { label: "name", operand: { type: "name", value: "Foo" } as PdfObject },
  { label: "boolean", operand: { type: "boolean", value: true } as PdfObject },
  {
    label: "string",
    operand: {
      type: "string",
      value: new Uint8Array([0x61]),
      encoding: "literal",
    } as PdfObject,
  },
  { label: "null", operand: { type: "null" } as PdfObject },
  { label: "array", operand: { type: "array", elements: [] } as PdfObject },
  {
    label: "dictionary",
    operand: { type: "dictionary", entries: new Map() } as PdfObject,
  },
  {
    label: "indirect-ref",
    operand: {
      type: "indirect-ref",
      objectNumber: 1,
      generationNumber: 0,
    } as PdfObject,
  },
  {
    label: "stream",
    operand: {
      type: "stream",
      dictionary: { type: "dictionary", entries: new Map() },
      data: new Uint8Array(),
    } as PdfObject,
  },
])("operand が $label のとき OPERATOR_OPERAND_TYPE_MISMATCH を返す", ({
  label,
  operand,
}) => {
  const ctx = buildContext([operand]);

  const result = GHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("G");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe(label);
  expect(result.error.message).toBe(
    `Operator 'G' expected number operand, got ${label}`,
  );
});

test("TYPE_MISMATCH 時に pop 済みの operand は復元しない (depth が減ったまま)", () => {
  const ctx = buildContext([{ type: "name", value: "Foo" }]);
  const beforeDepth = OperandStack.depth(ctx.operandStack);

  const result = GHandler(ctx);

  assert(!result.ok);
  expect(beforeDepth).toBe(1);
  expect(OperandStack.depth(ctx.operandStack)).toBe(0);
});

test.each([
  { label: "0", value: 0 },
  { label: "1", value: 1 },
  { label: "negative", value: -0.1 },
  { label: ">1", value: 1.5 },
  { label: "NaN", value: Number.NaN },
  { label: "Positive Infinity", value: Number.POSITIVE_INFINITY },
  { label: "Negative Infinity", value: Number.NEGATIVE_INFINITY },
])("境界値 $label は検証せず Color.gray にそのまま透過する", ({ value }) => {
  const ctx = buildContext([real(value)]);

  const result = GHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.strokeColor).toEqual(Color.gray(value));
});
