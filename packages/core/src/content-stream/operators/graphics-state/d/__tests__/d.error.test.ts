import { assert, expect, test } from "vitest";
import { GenerationNumber } from "../../../../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../../../../pdf/types/object-number/index";
import type {
  PdfObject,
  PdfValue,
} from "../../../../../pdf/types/pdf-types/index";
import { GraphicsStateStack } from "../../../../graphics-state/index";
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
const real = (value: number): PdfValue => ({ type: "real", value });
const array = (elements: PdfValue[]): PdfValue => ({
  type: "array",
  elements,
});

const name: PdfValue = { type: "name", value: "F1" };
const pdfString: PdfValue = {
  type: "string",
  value: new Uint8Array([0x41]),
  encoding: "literal",
};
const bool: PdfValue = { type: "boolean", value: true };
const nullValue: PdfValue = { type: "null" };
const dictionary: PdfValue = { type: "dictionary", entries: new Map() };
const indirectRef: PdfValue = {
  type: "indirect-ref",
  objectNumber: ObjectNumber.of(1),
  generationNumber: GenerationNumber.of(0),
};

const NON_NUMERIC: ReadonlyArray<readonly [string, PdfValue]> = [
  ["name", name],
  ["string", pdfString],
  ["boolean", bool],
  ["null", nullValue],
  ["array", array([])],
  ["dictionary", dictionary],
  ["indirect-ref", indirectRef],
];

const NON_ARRAY: ReadonlyArray<readonly [string, PdfValue]> = [
  ["integer", int(1)],
  ["real", real(1.5)],
  ["name", name],
  ["string", pdfString],
  ["boolean", bool],
  ["null", nullValue],
  ["dictionary", dictionary],
  ["indirect-ref", indirectRef],
];

test("operand が空のとき OPERATOR_OPERAND_MISSING (actual=0) を返す", () => {
  const context = buildContext([]);

  const result = dHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("d");
  expect(result.error.required).toBe(2);
  expect(result.error.actual).toBe(0);
  expect(result.error.message).toBe(
    "Operator 'd' requires 2 operand(s), got 0",
  );
});

test("numeric 1 個のみ（`11 d`）のとき OPERATOR_OPERAND_MISSING (actual=1) を返す", () => {
  const context = buildContext([int(11)]);

  const result = dHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("d");
  expect(result.error.required).toBe(2);
  expect(result.error.actual).toBe(1);
  expect(result.error.message).toBe(
    "Operator 'd' requires 2 operand(s), got 1",
  );
});

test.each(
  NON_NUMERIC,
)("dashPhase が %s のとき OPERATOR_OPERAND_TYPE_MISMATCH を返す", (actualType, operand) => {
  const context = buildContext([array([int(3), int(2)]), operand]);

  const result = dHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("d");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe(actualType);
  expect(result.error.message).toBe(
    `Operator 'd' expected number operand, got ${actualType}`,
  );
});

test.each(
  NON_ARRAY,
)("dashArray が %s のとき OPERATOR_OPERAND_TYPE_MISMATCH を返す", (actualType, operand) => {
  const context = buildContext([operand, int(11)]);

  const result = dHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("d");
  expect(result.error.expected).toBe("array");
  expect(result.error.actual).toBe(actualType);
  expect(result.error.message).toBe(
    `Operator 'd' expected array operand, got ${actualType}`,
  );
});

test.each(
  NON_NUMERIC,
)("配列途中の要素が %s のとき index 付き message を返す", (actualType, element) => {
  const context = buildContext([array([int(3), element]), int(11)]);

  const result = dHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("d");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe(actualType);
  expect(result.error.message).toBe(
    `Operator 'd' expected number array element at index 1, got ${actualType}`,
  );
});

test("不正要素が複数あるとき最初の 1 件のみ報告する", () => {
  const context = buildContext([array([name, name]), int(11)]);

  const result = dHandler(context);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("d");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe("name");
  expect(result.error.message).toBe(
    "Operator 'd' expected number array element at index 0, got name",
  );
});

test("phase 型不一致時に pop 済み operand を stack へ戻さない", () => {
  const context = buildContext([int(99), array([int(3), int(2)]), name]);

  const result = dHandler(context);

  assert(!result.ok);
  expect(OperandStack.depth(context.operandStack)).toBe(1);
  const top = OperandStack.peek(context.operandStack);
  assert(top.some);
  expect(top.value).toEqual({ type: "integer", value: 99 });
});

test("array 型不一致時に pop 済み operand を stack へ戻さない", () => {
  const context = buildContext([int(99), int(1), int(11)]);

  const result = dHandler(context);

  assert(!result.ok);
  expect(OperandStack.depth(context.operandStack)).toBe(1);
  const top = OperandStack.peek(context.operandStack);
  assert(top.some);
  expect(top.value).toEqual({ type: "integer", value: 99 });
});

test("要素型不一致時に pop 済み operand を stack へ戻さない", () => {
  const context = buildContext([int(99), array([int(3), name]), int(11)]);

  const result = dHandler(context);

  assert(!result.ok);
  expect(OperandStack.depth(context.operandStack)).toBe(1);
  const top = OperandStack.peek(context.operandStack);
  assert(top.some);
  expect(top.value).toEqual({ type: "integer", value: 99 });
});

test("エラー時 `graphicsStateStack` が同一参照のまま", () => {
  const context = buildContext([int(99), array([int(3), int(2)]), name]);
  const before = context.graphicsStateStack;

  const result = dHandler(context);

  assert(!result.ok);
  expect(context.graphicsStateStack).toBe(before);
});

test("エラー時 current の dashPattern が初期値のまま", () => {
  const context = buildContext([int(99), array([int(3), int(2)]), name]);

  const result = dHandler(context);

  assert(!result.ok);
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  expect(current.dashPattern).toEqual({ array: [], phase: 0 });
});
