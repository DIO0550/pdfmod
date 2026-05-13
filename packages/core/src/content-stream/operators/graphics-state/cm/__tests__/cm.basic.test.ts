import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import { GraphicsStateStack, Matrix } from "../../../../graphics-state/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { cmHandler } from "../../cm";

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

test("identity 行列を identity CTM に適用すると CTM は identity のまま", () => {
  const ctx = buildContext([
    real(1),
    real(0),
    real(0),
    real(1),
    real(0),
    real(0),
  ]);

  const result = cmHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.ctm).toEqual(Matrix.identity());
});

test("平行移動 [1,0,0,1,10,20] を identity CTM に適用すると CTM が [1,0,0,1,10,20] になる", () => {
  const ctx = buildContext([
    real(1),
    real(0),
    real(0),
    real(1),
    real(10),
    real(20),
  ]);

  const result = cmHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.ctm).toEqual(Matrix.create(1, 0, 0, 1, 10, 20));
});

test("スケール [2,0,0,3,0,0] を identity CTM に適用すると CTM が [2,0,0,3,0,0] になる", () => {
  const ctx = buildContext([
    real(2),
    real(0),
    real(0),
    real(3),
    real(0),
    real(0),
  ]);

  const result = cmHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.ctm).toEqual(Matrix.create(2, 0, 0, 3, 0, 0));
});

test("integer / real 混在 operand が許容される", () => {
  const ctx = buildContext([
    int(1),
    int(0),
    int(0),
    int(1),
    int(10),
    real(20.5),
  ]);

  const result = cmHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.ctm).toEqual(Matrix.create(1, 0, 0, 1, 10, 20.5));
});

test("左乗算検証 (非可換): CTM が S(2,3) の状態で T(5,7) を cm 適用すると CTM = T × S = [2,0,0,3,10,21]", () => {
  // 事前に CTM を S(2,3) に仕込む (cm operator 自身の正常系を使って構築)
  const setup = buildContext([
    real(2),
    real(0),
    real(0),
    real(3),
    real(0),
    real(0),
  ]);
  const setupResult = cmHandler(setup);
  assert(setupResult.ok);
  const stackWithS = setupResult.value.graphicsStateStack;

  // T(5,7) を push
  const operandStack = OperandStack.create();
  for (const operand of [
    real(1),
    real(0),
    real(0),
    real(1),
    real(5),
    real(7),
  ]) {
    OperandStack.push(operandStack, operand);
  }

  const result = cmHandler({
    operandStack,
    graphicsStateStack: stackWithS,
  });

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  // newCTM = T × S = [2,0,0,3,10,21]  (逆順 S × T だと [2,0,0,3,5,7] になる)
  expect(current.ctm).toEqual(Matrix.create(2, 0, 0, 3, 10, 21));
});

test("平行移動の合成: CTM が T(10,20) の状態で T(5,7) を cm 適用すると CTM = T(15,27)", () => {
  const setup = buildContext([
    real(1),
    real(0),
    real(0),
    real(1),
    real(10),
    real(20),
  ]);
  const setupResult = cmHandler(setup);
  assert(setupResult.ok);
  const stackWithT1 = setupResult.value.graphicsStateStack;

  const operandStack = OperandStack.create();
  for (const operand of [
    real(1),
    real(0),
    real(0),
    real(1),
    real(5),
    real(7),
  ]) {
    OperandStack.push(operandStack, operand);
  }

  const result = cmHandler({
    operandStack,
    graphicsStateStack: stackWithT1,
  });

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.ctm).toEqual(Matrix.create(1, 0, 0, 1, 15, 27));
});

test("operand 順序: a=2, b=3, c=5, d=7, e=11, f=13 を push 順で積むと CTM = [2,3,5,7,11,13]", () => {
  // a を最初に push、f を最後に push (PDF spec の `a b c d e f cm` と一致)
  const ctx = buildContext([
    real(2),
    real(3),
    real(5),
    real(7),
    real(11),
    real(13),
  ]);

  const result = cmHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.ctm).toEqual(Matrix.create(2, 3, 5, 7, 11, 13));
});

test("成功時 6 個 pop した結果 operand stack が空になる (depth 0)", () => {
  const ctx = buildContext([
    real(1),
    real(0),
    real(0),
    real(1),
    real(0),
    real(0),
  ]);

  const result = cmHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test.each([
  { label: "0", value: 0 },
  { label: "negative", value: -1.5 },
  { label: "NaN", value: Number.NaN },
  { label: "Positive Infinity", value: Number.POSITIVE_INFINITY },
  { label: "Negative Infinity", value: Number.NEGATIVE_INFINITY },
])("境界値 $label が混入しても handler では検証せずそのまま CTM に格納する", ({
  value,
}) => {
  const ctx = buildContext([
    real(value),
    real(0),
    real(0),
    real(1),
    real(0),
    real(0),
  ]);

  const result = cmHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  // a だけ value にして残りは identity 風に
  expect(current.ctm[0]).toEqual(value);
});

test.each([
  { label: "0 個", count: 0 },
  { label: "3 個", count: 3 },
  { label: "5 個", count: 5 },
])("operand $label のとき OPERATOR_OPERAND_MISSING を返し actual = pop 成功数", ({
  count,
}) => {
  const operands: PdfObject[] = Array.from({ length: count }, () => real(1));
  const ctx = buildContext(operands);

  const result = cmHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("cm");
  expect(result.error.required).toBe(6);
  expect(result.error.actual).toBe(count);
  expect(result.error.message).toBe(
    `Operator 'cm' requires 6 operand(s), got ${count}`,
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
])("top (PDF 順 f) が $label のとき TYPE_MISMATCH を返し depth は 5 (top のみ pop 済み)", ({
  label,
  operand,
}) => {
  const ctx = buildContext([
    real(1),
    real(0),
    real(0),
    real(1),
    real(10),
    operand,
  ]);

  const result = cmHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("cm");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe(label);
  expect(result.error.message).toBe(
    `Operator 'cm' expected number operand, got ${label}`,
  );
  expect(OperandStack.depth(ctx.operandStack)).toBe(5);
});

test("bottom (PDF 順 a) が boolean のとき TYPE_MISMATCH を返し depth は 0 (6 個 pop 済み)", () => {
  const bottom: PdfObject = { type: "boolean", value: true };
  // push 順は [a=bottom, b, c, d, e, f] なので、最初に push するのが bottom
  const ctx = buildContext([
    bottom,
    real(0),
    real(0),
    real(1),
    real(10),
    real(20),
  ]);

  const result = cmHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.actual).toBe("boolean");
  expect(OperandStack.depth(ctx.operandStack)).toBe(0);
});

test("成功時 lineWidth / lineCap / lineJoin / miterLimit は不変", () => {
  const ctx = buildContext([
    real(1),
    real(0),
    real(0),
    real(1),
    real(10),
    real(20),
  ]);
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = cmHandler(ctx);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.lineWidth).toBe(before.lineWidth);
  expect(after.lineCap).toBe(before.lineCap);
  expect(after.lineJoin).toBe(before.lineJoin);
  expect(after.miterLimit).toBe(before.miterLimit);
});

test("成功時 result.value.operandStack は context.operandStack と同一参照 (in-place mutate)", () => {
  const ctx = buildContext([
    real(1),
    real(0),
    real(0),
    real(1),
    real(0),
    real(0),
  ]);

  const result = cmHandler(ctx);

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
});

test("TYPE_MISMATCH 時に部分消費した operand stack は復元しない (depth が減ったまま)", () => {
  const operands: PdfObject[] = [
    real(1),
    real(0),
    real(0),
    real(1),
    real(10),
    { type: "name", value: "Foo" },
  ];
  const ctx = buildContext(operands);
  const beforeDepth = OperandStack.depth(ctx.operandStack);

  const result = cmHandler(ctx);

  assert(!result.ok);
  // 元々 6 個 → top の name を 1 個 pop で抜けたので 5 個残る
  expect(beforeDepth).toBe(6);
  expect(OperandStack.depth(ctx.operandStack)).toBe(5);
});
