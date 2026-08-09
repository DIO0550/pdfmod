import { assert, expect, test } from "vitest";
import type {
  PdfObject,
  PdfValue,
} from "../../../../../pdf/types/pdf-types/index";
import {
  DashPattern,
  GraphicsStateStack,
} from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { dHandler } from "../index";

// push 順 = PDF 記述順。stack 頂上が dashPhase になる。
const buildContext = (operands: PdfObject[]): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  return {
    operandStack,
    graphicsStateStack: GraphicsStateStack.create(),
    markedContentStack: MarkedContentStack.create(),
  };
};

const int = (value: number): PdfValue => ({ type: "integer", value });
const array = (elements: PdfValue[]): PdfObject => ({
  type: "array",
  elements,
});

test("`[] 0 d` は dashPattern を solid line 相当に戻す", () => {
  const context = buildContext([array([]), int(0)]);

  const result = dHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  // 参照同一性は主張しない。構造比較のみ（DashPattern.solid() の JSDoc 契約）
  expect(current.dashPattern).toEqual(DashPattern.solid());
  expect(current.dashPattern).toEqual({ array: [], phase: 0 });
});

test("破線設定後に `[] 0 d` で実線へ戻る", () => {
  const context = buildContext([array([int(3), int(2)]), int(11)]);

  const dashed = dHandler(context);
  assert(dashed.ok);
  OperandStack.push(dashed.value.operandStack, array([]));
  OperandStack.push(dashed.value.operandStack, int(0));

  const result = dHandler(dashed.value);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.dashPattern).toEqual({ array: [], phase: 0 });
});

test("破線設定から solid へ戻したとき、実行前の初期値と同値になる", () => {
  const context = buildContext([array([int(3), int(2)]), int(11)]);
  const initial = GraphicsStateStack.current(
    context.graphicsStateStack,
  ).dashPattern;

  const dashed = dHandler(context);
  assert(dashed.ok);
  OperandStack.push(dashed.value.operandStack, array([]));
  OperandStack.push(dashed.value.operandStack, int(0));

  const result = dHandler(dashed.value);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.dashPattern).toEqual(initial);
});

test("`[] 5 d` は phase を保持する", () => {
  const context = buildContext([array([]), int(5)]);

  const result = dHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.dashPattern).toEqual({ array: [], phase: 5 });
});

test("`[] -1 d` も型検証を通過する", () => {
  const context = buildContext([array([]), int(-1)]);

  const result = dHandler(context);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.dashPattern).toEqual({ array: [], phase: -1 });
});
