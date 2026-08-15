import { assert, expect, test } from "vitest";
import { some } from "../../../../../utils/option/index";
import { ClippingRule } from "../../../../graphics-state/clipping-rule/index";
import { CurrentPath } from "../../../../graphics-state/current-path/index";
import { GraphicsStateStack } from "../../../../graphics-state/stack/index";
import {
  ContentStreamInterpreter,
  type ContentStreamInterpreterResult,
} from "../../../../interpreter/index";
import { OperatorRegistry } from "../../../../operator-registry/index";
import { registerGraphicsStateOperators } from "../../../graphics-state/graphics-state-operators";
import { registerPathOperators } from "../../path-operators";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

const TRIANGLE = "100 100 m 200 100 l 200 200 l";

const run = (source: string): ContentStreamInterpreterResult => {
  const registered = registerPathOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode(source),
    registry: registered.value,
  });

  assert(result.ok);
  return result.value;
};

const PAINT_OPERATORS = [
  "S",
  "s",
  "f",
  "F",
  "f*",
  "B",
  "B*",
  "b",
  "b*",
  "n",
] as const;

test("W n で pendingClip が消費され currentPath も空になる", () => {
  const value = run(`${TRIANGLE} W n`);

  const current = GraphicsStateStack.current(value.context.graphicsStateStack);
  expect(current.pendingClip.some).toBe(false);
  expect(CurrentPath.isEmpty(current.currentPath)).toBe(true);
  expect(value.warnings).toEqual([]);
});

test("W* n でも pendingClip が消費され currentPath も空になる", () => {
  const value = run(`${TRIANGLE} W* n`);

  const current = GraphicsStateStack.current(value.context.graphicsStateStack);
  expect(current.pendingClip.some).toBe(false);
  expect(CurrentPath.isEmpty(current.currentPath)).toBe(true);
  expect(value.warnings).toEqual([]);
});

test("paint operator が来るまで pendingClip は保持される", () => {
  const value = run("100 100 m W 200 200 l");

  const current = GraphicsStateStack.current(value.context.graphicsStateStack);
  expect(current.pendingClip).toEqual(some(ClippingRule.nonzero()));
  expect(value.warnings).toEqual([]);
});

test.each(
  PAINT_OPERATORS,
)("paint operator %s は pendingClip を消費する", (operator) => {
  const value = run(`${TRIANGLE} W ${operator}`);

  const current = GraphicsStateStack.current(value.context.graphicsStateStack);
  expect(current.pendingClip.some).toBe(false);
});

test("W と W* は別のトークンとして解決される", () => {
  const nonzero = run(`${TRIANGLE} W`);
  const evenOdd = run(`${TRIANGLE} W*`);

  expect(
    GraphicsStateStack.current(nonzero.context.graphicsStateStack).pendingClip,
  ).toEqual(some(ClippingRule.nonzero()));
  expect(
    GraphicsStateStack.current(evenOdd.context.graphicsStateStack).pendingClip,
  ).toEqual(some(ClippingRule.evenOdd()));
});
const runWithGraphicsState = (
  source: string,
): ContentStreamInterpreterResult => {
  const withPath = registerPathOperators(OperatorRegistry.create());
  assert(withPath.ok);
  const registered = registerGraphicsStateOperators(withPath.value);
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode(source),
    registry: registered.value,
  });

  assert(result.ok);
  return result.value;
};

test("q W Q で pendingClip が q 実行前の none に戻る", () => {
  const value = runWithGraphicsState("q W Q");

  expect(
    GraphicsStateStack.current(value.context.graphicsStateStack).pendingClip
      .some,
  ).toBe(false);
});

test("q の内側で W n しても外側に pendingClip が漏れない", () => {
  const value = runWithGraphicsState(`q ${TRIANGLE} W n Q`);

  expect(
    GraphicsStateStack.current(value.context.graphicsStateStack).pendingClip
      .some,
  ).toBe(false);
  expect(value.warnings).toEqual([]);
});

test("q 前に設定済みの pendingClip は Q でその値に戻る", () => {
  const value = runWithGraphicsState(`${TRIANGLE} W* q 200 200 l W Q`);

  expect(
    GraphicsStateStack.current(value.context.graphicsStateStack).pendingClip,
  ).toEqual(some(ClippingRule.evenOdd()));
});

test("W W* と続けた場合は後勝ちで even-odd になり n で消費される", () => {
  const held = run(`${TRIANGLE} W W*`);
  expect(
    GraphicsStateStack.current(held.context.graphicsStateStack).pendingClip,
  ).toEqual(some(ClippingRule.evenOdd()));

  const consumed = run(`${TRIANGLE} W W* n`);
  expect(
    GraphicsStateStack.current(consumed.context.graphicsStateStack).pendingClip
      .some,
  ).toBe(false);
  expect(consumed.warnings).toEqual([]);
});

test("paint が来ずにストリームが終わると pendingClip は some のまま残る", () => {
  const value = run(`${TRIANGLE} W`);

  expect(
    GraphicsStateStack.current(value.context.graphicsStateStack).pendingClip,
  ).toEqual(some(ClippingRule.nonzero()));
  expect(value.warnings).toEqual([]);
});
