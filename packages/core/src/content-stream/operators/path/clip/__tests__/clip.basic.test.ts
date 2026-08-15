import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import { none, type Option, some } from "../../../../../utils/option/index";
import {
  ClippingRule,
  CurrentPath,
  GraphicsState,
  GraphicsStateStack,
} from "../../../../graphics-state/index";
import { PathSegment } from "../../../../graphics-state/path-segment";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { clipHandler } from "../index";

const real = (value: number): PdfObject => ({ type: "real", value });

const buildContext = (
  pendingClip: Option<ClippingRule> = none,
  segments: PathSegment[] = [],
  operands: PdfObject[] = [],
): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const initial = GraphicsState.create();
  let path = initial.currentPath;
  for (const segment of segments) {
    path = CurrentPath.append(path, segment);
  }
  const state = GraphicsState.update(initial, {
    pendingClip,
    currentPath: path,
  });

  return {
    operandStack,
    graphicsStateStack: GraphicsStateStack.replaceCurrent(
      GraphicsStateStack.create(),
      state,
    ),
    markedContentStack: MarkedContentStack.create(),
  };
};

test("pendingClip が既に even-odd でも W は nonzero で上書きする", () => {
  const context = buildContext(some(ClippingRule.evenOdd()), [
    PathSegment.moveTo(0, 0),
  ]);

  const result = clipHandler(context);

  assert(result.ok);
  expect(
    GraphicsStateStack.current(result.value.graphicsStateStack).pendingClip,
  ).toEqual(some(ClippingRule.nonzero()));
});

test("W は入力の graphicsStateStack を mutate しない", () => {
  const context = buildContext(none, [PathSegment.moveTo(0, 0)]);

  clipHandler(context);

  expect(
    GraphicsStateStack.current(context.graphicsStateStack).pendingClip.some,
  ).toBe(false);
});

test("W は pendingClip 以外の graphics state を変更しない", () => {
  const context = buildContext(none, [PathSegment.moveTo(0, 0)]);
  const before = GraphicsStateStack.current(context.graphicsStateStack);

  const result = clipHandler(context);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.ctm).toEqual(before.ctm);
  expect(after.lineWidth).toBe(before.lineWidth);
  expect(after.lineCap).toBe(before.lineCap);
  expect(after.lineJoin).toBe(before.lineJoin);
  expect(after.miterLimit).toBe(before.miterLimit);
  expect(after.dashPattern).toEqual(before.dashPattern);
  expect(after.strokeColor).toEqual(before.strokeColor);
  expect(after.fillColor).toEqual(before.fillColor);
  expect(after.strokeColorSpace).toBe(before.strokeColorSpace);
  expect(after.fillColorSpace).toBe(before.fillColorSpace);
  expect(after.textState).toEqual(before.textState);
  expect(after.textObject).toEqual(before.textObject);
  expect(after.renderingIntent).toBe(before.renderingIntent);
  expect(after.flatness).toBe(before.flatness);
});

test("W は pendingClip を nonzero 規則に設定する", () => {
  const context = buildContext(none, [
    PathSegment.moveTo(100, 100),
    PathSegment.lineTo(200, 200),
  ]);

  const result = clipHandler(context);

  assert(result.ok);
  expect(
    GraphicsStateStack.current(result.value.graphicsStateStack).pendingClip,
  ).toEqual(some(ClippingRule.nonzero()));
});

test("W は currentPath を変更しない", () => {
  const context = buildContext(none, [
    PathSegment.moveTo(100, 100),
    PathSegment.lineTo(200, 200),
  ]);

  const result = clipHandler(context);

  assert(result.ok);
  expect(
    GraphicsStateStack.current(result.value.graphicsStateStack).currentPath
      .segments,
  ).toEqual([PathSegment.moveTo(100, 100), PathSegment.lineTo(200, 200)]);
});

test("W は operandStack を同一参照のまま返す", () => {
  const context = buildContext(none, [PathSegment.moveTo(0, 0)], [real(1)]);

  const result = clipHandler(context);

  assert(result.ok);
  expect(result.value.operandStack).toBe(context.operandStack);
});

test("current path が空でも W は pendingClip を設定する", () => {
  const context = buildContext();

  const result = clipHandler(context);

  assert(result.ok);
  expect(
    GraphicsStateStack.current(result.value.graphicsStateStack).pendingClip,
  ).toEqual(some(ClippingRule.nonzero()));
});
