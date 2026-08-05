import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  DashPattern,
  GraphicsStateStack,
} from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { dHandler } from "../index";

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

test("`[3 2] 11 d` 相当の operand で dashPattern が更新される", () => {
  const ctx = buildContext([
    {
      type: "array",
      elements: [
        { type: "integer", value: 3 },
        { type: "integer", value: 2 },
      ],
    },
    { type: "integer", value: 11 },
  ]);

  const result = dHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.dashPattern).toEqual(DashPattern.create([3, 2], 11));
});

test("`[1.5 2] 0.5 d` 相当の real 混在 operand で dashPattern が更新される", () => {
  const ctx = buildContext([
    {
      type: "array",
      elements: [
        { type: "real", value: 1.5 },
        { type: "integer", value: 2 },
      ],
    },
    { type: "real", value: 0.5 },
  ]);

  const result = dHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.dashPattern).toEqual(DashPattern.create([1.5, 2], 0.5));
});

test("`[3] 11 d` 相当の単一要素配列でも dashPattern が更新される", () => {
  const ctx = buildContext([
    { type: "array", elements: [{ type: "integer", value: 3 }] },
    { type: "integer", value: 11 },
  ]);

  const result = dHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.dashPattern).toEqual(DashPattern.create([3], 11));
});

test("成功時に operand 2 個が消費され operand stack が空になる", () => {
  const ctx = buildContext([
    { type: "array", elements: [{ type: "integer", value: 3 }] },
    { type: "integer", value: 11 },
  ]);

  const result = dHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("成功時に operandStack / markedContentStack は同一参照、graphicsStateStack は新参照を返す", () => {
  const ctx = buildContext([
    { type: "array", elements: [{ type: "integer", value: 3 }] },
    { type: "integer", value: 11 },
  ]);

  const result = dHandler(ctx);

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
  expect(result.value.markedContentStack).toBe(ctx.markedContentStack);
  expect(result.value.graphicsStateStack).not.toBe(ctx.graphicsStateStack);
});

test("dashPattern 更新後も lineWidth/lineCap/lineJoin/miterLimit/ctm は不変", () => {
  const ctx = buildContext([
    { type: "array", elements: [{ type: "integer", value: 3 }] },
    { type: "integer", value: 11 },
  ]);
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = dHandler(ctx);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.lineWidth).toBe(before.lineWidth);
  expect(after.lineCap).toBe(before.lineCap);
  expect(after.lineJoin).toBe(before.lineJoin);
  expect(after.miterLimit).toBe(before.miterLimit);
  expect(after.ctm).toEqual(before.ctm);
});
