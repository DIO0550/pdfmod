import { assert, expect, test } from "vitest";
import type {
  PdfObject,
  PdfValue,
} from "../../../../../pdf/types/pdf-types/index";
import {
  GraphicsState,
  GraphicsStateStack,
  TextObject,
  TextState,
} from "../../../../graphics-state/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { tjArrayHandler } from "../index";

const literalString = (bytes: number[]): PdfValue => ({
  type: "string",
  value: new Uint8Array(bytes),
  encoding: "literal",
});
const int = (value: number): PdfValue => ({ type: "integer", value });
const real = (value: number): PdfValue => ({ type: "real", value });
const array = (elements: PdfValue[]): PdfObject => ({
  type: "array",
  elements,
});

const buildActiveContext = (
  operands: PdfObject[],
  textState: Partial<{ fontSize: number; horizontalScaling: number }> = {},
): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const activeState = GraphicsState.update(GraphicsState.create(), {
    textObject: TextObject.begin(),
    textState: TextState.update(TextState.create(), textState),
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    GraphicsStateStack.create(),
    activeState,
  );
  return { operandStack, graphicsStateStack };
};

// "[(H) 40 (ello)] TJ" で textMatrix が水平方向に translate され、textLineMatrix は据え置きされる。
// Matrix は readonly tuple [a,b,c,d,e,f]。e=textMatrix[4]、f=textMatrix[5]。
test("string と integer 混在の配列で textMatrix のみが水平 translate される", () => {
  const context = buildActiveContext(
    [
      array([
        literalString([0x48]),
        int(40),
        literalString([0x65, 0x6c, 0x6c, 0x6f]),
      ]),
    ],
    { fontSize: 12, horizontalScaling: 100 },
  );
  const before = GraphicsStateStack.current(context.graphicsStateStack);

  const result = tjArrayHandler(context);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  // offset = -40/1000 × 12 × 1 = -0.48
  expect(after.textObject.textMatrix[4]).toBeCloseTo(-0.48);
  expect(after.textObject.textMatrix[5]).toBeCloseTo(0);
  // textLineMatrix は引数据え置き
  expect(after.textObject.textLineMatrix).toBe(
    before.textObject.textLineMatrix,
  );
});

// 空配列 [] では state が更新されず、graphicsStateStack が同一参照で返る。
test("空配列で graphicsStateStack は同一参照を返す", () => {
  const context = buildActiveContext([array([])]);

  const result = tjArrayHandler(context);

  assert(result.ok);
  expect(result.value.graphicsStateStack).toBe(context.graphicsStateStack);
});

// string のみの配列は数値要素を含まず、同一参照を返す。
test("string のみの配列で graphicsStateStack は同一参照を返す", () => {
  const context = buildActiveContext([
    array([literalString([0x48]), literalString([0x65])]),
  ]);

  const result = tjArrayHandler(context);

  assert(result.ok);
  expect(result.value.graphicsStateStack).toBe(context.graphicsStateStack);
});

// integer + real を混在させ、累積 offset が textMatrix[4] (= e) に正しく反映される。
test("integer と real が混在するときに offset が累積される", () => {
  // fontSize = 10, hScale = 100。 i1 = 100 → -1.0, r1 = 50.5 → -0.505
  // 期待 textMatrix[4] = -1.0 + (-0.505) = -1.505
  const context = buildActiveContext([array([int(100), real(50.5)])], {
    fontSize: 10,
    horizontalScaling: 100,
  });

  const result = tjArrayHandler(context);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.textObject.textMatrix[4]).toBeCloseTo(-1.505);
  expect(after.textObject.textMatrix[5]).toBeCloseTo(0);
});

// 同種数値要素（integer のみ）が複数並んだとき、累積 offset が textMatrix[4] に正しく反映される。
test("integer 2 件のみの累積で textMatrix[4] が両要素の和になる", () => {
  // fontSize = 12, hScale = 100。 50 → -0.6, 80 → -0.96
  // 期待 textMatrix[4] = -0.6 + (-0.96) = -1.56
  const context = buildActiveContext([array([int(50), int(80)])], {
    fontSize: 12,
    horizontalScaling: 100,
  });

  const result = tjArrayHandler(context);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.textObject.textMatrix[4]).toBeCloseTo(-1.56);
  expect(after.textObject.textMatrix[5]).toBeCloseTo(0);
});

// fontSize === 0 の場合、数値要素は offset === 0 となり textMatrix 不変・同一参照のまま返る。
test("fontSize === 0 のとき数値要素は short-circuit され同一参照を返す", () => {
  const context = buildActiveContext([array([int(100), real(-50)])], {
    fontSize: 0,
    horizontalScaling: 100,
  });

  const result = tjArrayHandler(context);

  assert(result.ok);
  expect(result.value.graphicsStateStack).toBe(context.graphicsStateStack);
});

// horizontalScaling === 0 でも offset === 0 となり short-circuit で同一参照保持。
test("horizontalScaling === 0 のとき数値要素は short-circuit され同一参照を返す", () => {
  const context = buildActiveContext([array([int(100), real(-50)])], {
    fontSize: 12,
    horizontalScaling: 0,
  });

  const result = tjArrayHandler(context);

  assert(result.ok);
  expect(result.value.graphicsStateStack).toBe(context.graphicsStateStack);
});

// element.value === 0 でも offset === 0 となり short-circuit で同一参照保持。
test("数値要素の値が 0 のとき short-circuit され graphicsStateStack 同一参照を返す", () => {
  const context = buildActiveContext([array([int(0), real(0)])], {
    fontSize: 12,
    horizontalScaling: 100,
  });

  const result = tjArrayHandler(context);

  assert(result.ok);
  expect(result.value.graphicsStateStack).toBe(context.graphicsStateStack);
});

// 成功時 operandStack は (in-place pop 済みで) 同一参照を保つ。
test("成功時 operandStack は入力と同一参照を返す", () => {
  const context = buildActiveContext([array([int(50)])], { fontSize: 12 });

  const result = tjArrayHandler(context);

  assert(result.ok);
  expect(result.value.operandStack).toBe(context.operandStack);
});

// horizontalScaling=200 のとき offset が 2 倍になる。
test("horizontalScaling=200 のとき offset が 2 倍に拡大される", () => {
  // fontSize = 12, hScale = 200。 50 → -50/1000 × 12 × 2 = -1.2
  const context = buildActiveContext([array([int(50)])], {
    fontSize: 12,
    horizontalScaling: 200,
  });

  const result = tjArrayHandler(context);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.textObject.textMatrix[4]).toBeCloseTo(-1.2);
});

// 負の数値要素は offset の符号が反転し textMatrix[4] が正方向に移動することを固定する。
test("負の数値要素 int(-50) で textMatrix[4] が正方向に offset される", () => {
  // fontSize = 12, hScale = 100。-(-50) / 1000 × 12 × 1 = +0.6
  const context = buildActiveContext([array([int(-50)])], {
    fontSize: 12,
    horizontalScaling: 100,
  });

  const result = tjArrayHandler(context);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.textObject.textMatrix[4]).toBeCloseTo(0.6);
});
