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
import { RGHandler } from "../index";

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

test("`0 0 0 RG` で strokeColor が Color.rgb(0, 0, 0) に更新される", () => {
  const ctx = buildContext([real(0), real(0), real(0)]);

  const result = RGHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.strokeColor).toEqual(Color.rgb(0, 0, 0));
});

test("`1 0 0 RG` で strokeColor=Color.rgb(1, 0, 0) / strokeColorSpace=deviceRGB() になる", () => {
  const ctx = buildContext([real(1), real(0), real(0)]);

  const result = RGHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.strokeColor).toEqual(Color.rgb(1, 0, 0));
  expect(current.strokeColorSpace).toEqual(ColorSpace.deviceRGB());
});

test("integer operand `1 0 0 RG` でも Color.rgb(1, 0, 0) になる", () => {
  const ctx = buildContext([int(1), int(0), int(0)]);

  const result = RGHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.strokeColor).toEqual(Color.rgb(1, 0, 0));
});

test("成功時 fillColor / fillColorSpace は不変", () => {
  const ctx = buildContext([real(0.1), real(0.2), real(0.3)]);
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = RGHandler(ctx);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.fillColor).toEqual(before.fillColor);
  expect(after.fillColorSpace).toEqual(before.fillColorSpace);
});

test("初期 fillColor=rgb(0.5, 0.5, 0.5) の状態でも RG 実行後 fillColor は変わらない", () => {
  const operandStack = OperandStack.create();
  OperandStack.push(operandStack, real(1));
  OperandStack.push(operandStack, real(0));
  OperandStack.push(operandStack, real(0));
  const baseStack = GraphicsStateStack.create();
  const base = GraphicsStateStack.current(baseStack);
  const seeded = GraphicsState.update(base, {
    fillColor: Color.rgb(0.5, 0.5, 0.5),
    fillColorSpace: ColorSpace.deviceRGB(),
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    baseStack,
    seeded,
  );

  const result = RGHandler({ operandStack, graphicsStateStack });

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.fillColor).toEqual(Color.rgb(0.5, 0.5, 0.5));
  expect(current.fillColorSpace).toEqual(ColorSpace.deviceRGB());
  expect(current.strokeColor).toEqual(Color.rgb(1, 0, 0));
});

test("成功時 ctm / lineWidth / lineCap / lineJoin / miterLimit / currentPath は不変", () => {
  const ctx = buildContext([real(0.1), real(0.2), real(0.3)]);
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = RGHandler(ctx);

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
  const ctx = buildContext([real(0.1), real(0.2), real(0.3)]);

  const result = RGHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("成功時 result.value.operandStack は context.operandStack と同一参照", () => {
  const ctx = buildContext([real(0.1), real(0.2), real(0.3)]);

  const result = RGHandler(ctx);

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
});

test("operand stack に余剰要素 (5 個) がある場合、末尾 3 個だけ pop し残り 2 個は保持", () => {
  const head1 = int(99);
  const head2 = int(98);
  const ctx = buildContext([head1, head2, real(0.1), real(0.2), real(0.3)]);

  const result = RGHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.strokeColor).toEqual(Color.rgb(0.1, 0.2, 0.3));
  expect(OperandStack.depth(result.value.operandStack)).toBe(2);
  const top = OperandStack.peek(result.value.operandStack);
  assert(top.some);
  expect(top.value).toEqual(head2);
});

test.each([
  { label: "all zero", r: 0, g: 0, b: 0 },
  { label: "all one", r: 1, g: 1, b: 1 },
  { label: "negative r", r: -0.1, g: 0, b: 0 },
  { label: "negative g", r: 0, g: -0.5, b: 0 },
  { label: "negative b", r: 0, g: 0, b: -1 },
  { label: "r > 1", r: 1.5, g: 0, b: 0 },
  { label: "g > 1", r: 0, g: 2, b: 0 },
  { label: "b > 1", r: 0, g: 0, b: 1.0001 },
])("境界値 $label は検証せず Color.rgb にそのまま透過する", ({ r, g, b }) => {
  const ctx = buildContext([real(r), real(g), real(b)]);

  const result = RGHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.strokeColor).toEqual(Color.rgb(r, g, b));
});

test("NaN operand を渡しても handler はエラーを返さず Color.rgb の各成分が NaN になる", () => {
  const ctx = buildContext([
    real(Number.NaN),
    real(Number.NaN),
    real(Number.NaN),
  ]);

  const result = RGHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  assert(current.strokeColor.kind === "rgb");
  expect(Number.isNaN(current.strokeColor.r)).toBe(true);
  expect(Number.isNaN(current.strokeColor.g)).toBe(true);
  expect(Number.isNaN(current.strokeColor.b)).toBe(true);
});

test("+Infinity / -Infinity operand を渡しても handler はエラーを返さず Color.rgb にそのまま透過する", () => {
  const ctx = buildContext([
    real(Number.POSITIVE_INFINITY),
    real(Number.NEGATIVE_INFINITY),
    real(Number.POSITIVE_INFINITY),
  ]);

  const result = RGHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  assert(current.strokeColor.kind === "rgb");
  expect(current.strokeColor.r).toBe(Number.POSITIVE_INFINITY);
  expect(current.strokeColor.g).toBe(Number.NEGATIVE_INFINITY);
  expect(current.strokeColor.b).toBe(Number.POSITIVE_INFINITY);
});
