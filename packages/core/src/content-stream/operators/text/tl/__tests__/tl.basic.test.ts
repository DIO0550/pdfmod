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
import { tlHandler } from "../index";

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

test("'14 TL' で leading が 14 に更新される", () => {
  const context = buildContext([{ type: "integer", value: 14 }]);
  const result = tlHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textState.leading).toBe(14);
});

test("非0 の leading に '0 TL' を適用すると 0 にリセットされる", () => {
  const first = tlHandler(buildContext([{ type: "integer", value: 14 }]));
  assert(first.ok);

  const reset = tlHandler({
    operandStack: buildContext([{ type: "integer", value: 0 }]).operandStack,
    graphicsStateStack: first.value.graphicsStateStack,
    markedContentStack: MarkedContentStack.create(),
  });

  assert(reset.ok);
  const current = GraphicsStateStack.current(reset.value.graphicsStateStack);
  expect(current.textState.leading).toBe(0);
});

test.each<[string, PdfObject, number]>([
  ["小数", { type: "real", value: 1.5 }, 1.5],
  ["負値", { type: "real", value: -2.5 }, -2.5],
  ["NaN", { type: "real", value: Number.NaN }, Number.NaN],
  [
    "Infinity",
    { type: "real", value: Number.POSITIVE_INFINITY },
    Number.POSITIVE_INFINITY,
  ],
])("境界値 '%s' の operand も値域検証せず leading に格納する", (_label, operand, expected) => {
  const context = buildContext([operand]);
  const result = tlHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textState.leading).toBe(expected);
});

test("leading 更新時、非デフォルト値の他フィールドは保持される", () => {
  const seeded = GraphicsStateStack.create();
  const current = GraphicsStateStack.current(seeded);
  const seededTextState = TextState.update(current.textState, {
    charSpace: 5,
    wordSpace: 7,
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    seeded,
    GraphicsState.update(current, { textState: seededTextState }),
  );
  const result = tlHandler({
    operandStack: buildContext([{ type: "integer", value: 3 }]).operandStack,
    graphicsStateStack,
    markedContentStack: MarkedContentStack.create(),
  });

  assert(result.ok);
  const after = GraphicsStateStack.current(
    result.value.graphicsStateStack,
  ).textState;
  expect(after.leading).toBe(3);
  expect(after.charSpace).toBe(5);
  expect(after.wordSpace).toBe(7);
});

test("成功時に operand が消費され depth が 0 になる", () => {
  const context = buildContext([{ type: "integer", value: 14 }]);
  const result = tlHandler(context);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("余剰 operand があっても末尾 1 個のみ pop する", () => {
  const context = buildContext([
    { type: "integer", value: 1 },
    { type: "integer", value: 2 },
  ]);
  const result = tlHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textState.leading).toBe(2);
  expect(OperandStack.depth(result.value.operandStack)).toBe(1);
});
