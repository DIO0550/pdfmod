import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  GraphicsState,
  GraphicsStateStack,
  TextState,
} from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { tzHandler } from "../index";

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

test("'150 Tz' で horizontalScaling が 150 に更新される", () => {
  const context = buildContext([{ type: "integer", value: 150 }]);
  const result = tzHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textState.horizontalScaling).toBe(150);
});

test("'100 Tz' で horizontalScaling が 100（等倍）になる", () => {
  const result = tzHandler(buildContext([{ type: "integer", value: 100 }]));

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textState.horizontalScaling).toBe(100);
});

test.each<[string, PdfObject, number]>([
  ["小数", { type: "real", value: 87.5 }, 87.5],
  ["負値", { type: "real", value: -50 }, -50],
  [
    "Infinity",
    { type: "real", value: Number.POSITIVE_INFINITY },
    Number.POSITIVE_INFINITY,
  ],
])("境界値 '%s' の operand も値域検証せず horizontalScaling にそのまま格納する", (_label, operand, expected) => {
  const context = buildContext([operand]);
  const result = tzHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textState.horizontalScaling).toBe(expected);
});

test("NaN の operand も値域検証せず horizontalScaling にそのまま格納する", () => {
  const context = buildContext([{ type: "real", value: Number.NaN }]);
  const result = tzHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(Number.isNaN(current.textState.horizontalScaling)).toBe(true);
});

test("horizontalScaling 更新時、非デフォルト値の他フィールドは保持される", () => {
  const seeded = GraphicsStateStack.create();
  const current = GraphicsStateStack.current(seeded);
  const seededTextState = TextState.update(current.textState, {
    charSpace: 3,
    wordSpace: 5,
    leading: 7,
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    seeded,
    GraphicsState.update(current, { textState: seededTextState }),
  );
  const result = tzHandler({
    operandStack: buildContext([{ type: "integer", value: 150 }]).operandStack,
    graphicsStateStack,
    markedContentStack: MarkedContentStack.create(),
  });

  assert(result.ok);
  const after = GraphicsStateStack.current(
    result.value.graphicsStateStack,
  ).textState;
  expect(after.horizontalScaling).toBe(150);
  expect(after.charSpace).toBe(3);
  expect(after.wordSpace).toBe(5);
  expect(after.leading).toBe(7);
});

test("成功時に operand が消費され depth が 0 になる", () => {
  const context = buildContext([{ type: "integer", value: 150 }]);
  const result = tzHandler(context);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("余剰 operand があっても末尾 1 個のみ pop する", () => {
  const context = buildContext([
    { type: "integer", value: 1 },
    { type: "integer", value: 150 },
  ]);
  const result = tzHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textState.horizontalScaling).toBe(150);
  expect(OperandStack.depth(result.value.operandStack)).toBe(1);
});
