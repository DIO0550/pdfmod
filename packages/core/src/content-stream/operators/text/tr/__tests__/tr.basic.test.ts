import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  GraphicsState,
  GraphicsStateStack,
  TextRenderingMode,
  TextState,
} from "../../../../graphics-state/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { trHandler } from "../index";

const buildContext = (operands: PdfObject[]): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const graphicsStateStack = GraphicsStateStack.create();
  return { operandStack, graphicsStateStack };
};

test.each([
  { value: 0 },
  { value: 2 },
  { value: 7 },
] as const)("'$value Tr' で renderingMode が create($value) に更新される", ({
  value,
}) => {
  const context = buildContext([{ type: "integer", value }]);
  const result = trHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textState.renderingMode).toBe(TextRenderingMode.create(value));
});

test("renderingMode 更新時、非デフォルト値の他フィールドは保持される", () => {
  const seeded = GraphicsStateStack.create();
  const current = GraphicsStateStack.current(seeded);
  const seededTextState = TextState.update(current.textState, {
    charSpace: 3,
    horizontalScaling: 150,
    leading: 7,
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    seeded,
    GraphicsState.update(current, { textState: seededTextState }),
  );
  const result = trHandler({
    operandStack: buildContext([{ type: "integer", value: 2 }]).operandStack,
    graphicsStateStack,
  });

  assert(result.ok);
  const after = GraphicsStateStack.current(
    result.value.graphicsStateStack,
  ).textState;
  expect(after.renderingMode).toBe(TextRenderingMode.create(2));
  expect(after.charSpace).toBe(3);
  expect(after.horizontalScaling).toBe(150);
  expect(after.leading).toBe(7);
});

test("成功時に operand が消費され depth が 0 になる", () => {
  const context = buildContext([{ type: "integer", value: 0 }]);
  const result = trHandler(context);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("余剰 operand があっても末尾 1 個のみ pop する", () => {
  const context = buildContext([
    { type: "integer", value: 5 },
    { type: "integer", value: 3 },
  ]);
  const result = trHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.textState.renderingMode).toBe(TextRenderingMode.create(3));
  expect(OperandStack.depth(result.value.operandStack)).toBe(1);
});
