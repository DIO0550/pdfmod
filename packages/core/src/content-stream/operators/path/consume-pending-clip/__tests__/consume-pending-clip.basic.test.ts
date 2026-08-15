import { expect, test } from "vitest";
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
import { consumePendingClipContext } from "../index";

const buildContext = (
  pendingClip: Option<ClippingRule>,
  segments: PathSegment[] = [],
): OperatorHandlerContext => {
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
    operandStack: OperandStack.create(),
    graphicsStateStack: GraphicsStateStack.replaceCurrent(
      GraphicsStateStack.create(),
      state,
    ),
    markedContentStack: MarkedContentStack.create(),
  };
};

test("pendingClip が some のとき none に戻る", () => {
  const context = buildContext(some(ClippingRule.nonzero()), [
    PathSegment.moveTo(0, 0),
    PathSegment.lineTo(1, 1),
  ]);

  const result = consumePendingClipContext(context);

  expect(
    GraphicsStateStack.current(result.graphicsStateStack).pendingClip.some,
  ).toBe(false);
});

test("pendingClip が none のとき context を同一参照で返す", () => {
  const context = buildContext(none, [PathSegment.moveTo(0, 0)]);

  const result = consumePendingClipContext(context);

  expect(result).toBe(context);
});

test("current path が空でも pendingClip を消費する", () => {
  const context = buildContext(some(ClippingRule.evenOdd()));

  const result = consumePendingClipContext(context);

  expect(
    GraphicsStateStack.current(result.graphicsStateStack).pendingClip.some,
  ).toBe(false);
  expect(result.graphicsStateStack).not.toBe(context.graphicsStateStack);
});

test("消費しても currentPath は変更されない", () => {
  const context = buildContext(some(ClippingRule.nonzero()), [
    PathSegment.moveTo(0, 0),
    PathSegment.lineTo(1, 1),
  ]);

  const result = consumePendingClipContext(context);

  expect(
    GraphicsStateStack.current(result.graphicsStateStack).currentPath.segments,
  ).toEqual([PathSegment.moveTo(0, 0), PathSegment.lineTo(1, 1)]);
});

test("入力の graphicsStateStack を mutate しない", () => {
  const context = buildContext(some(ClippingRule.nonzero()), [
    PathSegment.moveTo(0, 0),
  ]);

  consumePendingClipContext(context);

  expect(
    GraphicsStateStack.current(context.graphicsStateStack).pendingClip,
  ).toEqual(some(ClippingRule.nonzero()));
});

test("q で保存済みの状態を保持したまま消費する", () => {
  const base = buildContext(some(ClippingRule.nonzero()), [
    PathSegment.moveTo(0, 0),
  ]);
  const saved = GraphicsStateStack.save(base.graphicsStateStack);
  const context: OperatorHandlerContext = {
    operandStack: base.operandStack,
    graphicsStateStack: saved,
    markedContentStack: base.markedContentStack,
  };

  const result = consumePendingClipContext(context);

  expect(
    GraphicsStateStack.current(result.graphicsStateStack).pendingClip.some,
  ).toBe(false);
  expect(
    GraphicsStateStack.current(context.graphicsStateStack).pendingClip,
  ).toEqual(some(ClippingRule.nonzero()));
});
