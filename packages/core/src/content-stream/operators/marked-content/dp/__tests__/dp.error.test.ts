import { assert, expect, test } from "vitest";
import type {
  PdfDictionary,
  PdfName,
  PdfObject,
} from "../../../../../pdf/types/pdf-types/index";
import { none } from "../../../../../utils/option/index";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import type { MarkedContentEntry } from "../../../../marked-content/stack";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { dpHandler } from "../index";

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

// markedContentStack を depth=1 の非空状態にして組み立てる（MISSING 時の不変性検証用）
const buildSeededContext = (
  operands: PdfObject[],
  seededTag: PdfName,
): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const seededEntry: MarkedContentEntry = { tag: seededTag, properties: none };
  return {
    operandStack,
    graphicsStateStack: GraphicsStateStack.create(),
    markedContentStack: MarkedContentStack.push(
      MarkedContentStack.create(),
      seededEntry,
    ),
  };
};

// properties 位置に許容されない型（dict/name 以外の 8 バリアント）
const NON_DICT_OR_NAME_CASES: ReadonlyArray<[string, PdfObject]> = [
  ["integer", { type: "integer", value: 42 }],
  ["real", { type: "real", value: 3.14 }],
  ["string", { type: "string", value: new Uint8Array(), encoding: "literal" }],
  ["boolean", { type: "boolean", value: true }],
  ["null", { type: "null" }],
  ["array", { type: "array", elements: [] }],
  [
    "indirect-ref",
    { type: "indirect-ref", objectNumber: 1, generationNumber: 0 },
  ],
  [
    "stream",
    {
      type: "stream",
      dictionary: { type: "dictionary", entries: new Map() },
      data: new Uint8Array(),
    },
  ],
];

// tag 位置に許容されない型（name 以外の 9 バリアント）
const NON_NAME_CASES: ReadonlyArray<[string, PdfObject]> = [
  ["integer", { type: "integer", value: 42 }],
  ["real", { type: "real", value: 3.14 }],
  ["string", { type: "string", value: new Uint8Array(), encoding: "literal" }],
  ["boolean", { type: "boolean", value: true }],
  ["null", { type: "null" }],
  ["array", { type: "array", elements: [] }],
  ["dictionary", { type: "dictionary", entries: new Map() }],
  [
    "indirect-ref",
    { type: "indirect-ref", objectNumber: 1, generationNumber: 0 },
  ],
  [
    "stream",
    {
      type: "stream",
      dictionary: { type: "dictionary", entries: new Map() },
      data: new Uint8Array(),
    },
  ],
];

// -------- MISSING 系 --------

test("operand 0 個で MISSING を返す（required:2, actual:0, operatorName:'DP'）", () => {
  const ctx = buildContext([]);

  const result = dpHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("DP");
  expect(result.error.required).toBe(2);
  expect(result.error.actual).toBe(0);
});

test("operand 0 個の MISSING メッセージが完全一致する（`Operator 'DP' requires 2 operand(s), got 0`）", () => {
  const ctx = buildContext([]);

  const result = dpHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.message).toBe(
    "Operator 'DP' requires 2 operand(s), got 0",
  );
});

test("operand 1 個（properties 位置 name のみ）で MISSING を返す（actual=1）", () => {
  const ctx = buildContext([{ type: "name", value: "Span" }]);

  const result = dpHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.actual).toBe(1);
});

test("operand 1 個の MISSING メッセージが完全一致する（`Operator 'DP' requires 2 operand(s), got 1`）", () => {
  const ctx = buildContext([{ type: "name", value: "Span" }]);

  const result = dpHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.message).toBe(
    "Operator 'DP' requires 2 operand(s), got 1",
  );
});

test("非空 seeded stack (depth=1) でも MISSING 時に markedContentStack は depth=1 のまま", () => {
  const ctx = buildSeededContext([], { type: "name", value: "Span" });

  const result = dpHandler(ctx);

  assert(!result.ok);
  expect(MarkedContentStack.depth(ctx.markedContentStack)).toBe(1);
});

test("MISSING 時（operand 0）markedContentStack は push されず depth=0 のまま", () => {
  const ctx = buildContext([]);

  const result = dpHandler(ctx);

  assert(!result.ok);
  expect(MarkedContentStack.depth(ctx.markedContentStack)).toBe(0);
});

// -------- properties TYPE_MISMATCH --------

test.each<[string, PdfObject]>(
  NON_DICT_OR_NAME_CASES,
)("properties が %s のとき TYPE_MISMATCH を返す（expected='name or dictionary', actual=type）", (type, operand) => {
  const ctx = buildContext([operand]);

  const result = dpHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("DP");
  expect(result.error.expected).toBe("name or dictionary");
  expect(result.error.actual).toBe(type);
});

test("properties TYPE_MISMATCH のメッセージが完全一致する（`Operator 'DP' expected name or dictionary operand, got integer`）", () => {
  const ctx = buildContext([{ type: "integer", value: 42 }]);

  const result = dpHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.message).toBe(
    "Operator 'DP' expected name or dictionary operand, got integer",
  );
});

test("properties TYPE_MISMATCH 時 markedContentStack は push されず不変（depth=0）", () => {
  const ctx = buildContext([{ type: "integer", value: 42 }]);

  const result = dpHandler(ctx);

  assert(!result.ok);
  expect(MarkedContentStack.depth(ctx.markedContentStack)).toBe(0);
});

test("properties TYPE_MISMATCH 時、部分消費した operand は復元しない（depth=1 → depth=0）", () => {
  const ctx = buildContext([{ type: "integer", value: 42 }]);
  expect(OperandStack.depth(ctx.operandStack)).toBe(1);

  const result = dpHandler(ctx);

  assert(!result.ok);
  expect(OperandStack.depth(ctx.operandStack)).toBe(0);
});

// -------- tag TYPE_MISMATCH --------

test.each<[string, PdfObject]>(
  NON_NAME_CASES,
)("tag が %s のとき TYPE_MISMATCH を返す（expected='name', actual=type）", (type, operand) => {
  const properties: PdfDictionary = {
    type: "dictionary",
    entries: new Map(),
  };
  const ctx = buildContext([operand, properties]);

  const result = dpHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("DP");
  expect(result.error.expected).toBe("name");
  expect(result.error.actual).toBe(type);
});

test("tag TYPE_MISMATCH のメッセージが完全一致する（`Operator 'DP' expected name operand, got integer`）", () => {
  const properties: PdfDictionary = {
    type: "dictionary",
    entries: new Map(),
  };
  const ctx = buildContext([{ type: "integer", value: 42 }, properties]);

  const result = dpHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.message).toBe(
    "Operator 'DP' expected name operand, got integer",
  );
});

test("tag TYPE_MISMATCH 時 markedContentStack は push されず不変（depth=0）", () => {
  const properties: PdfDictionary = {
    type: "dictionary",
    entries: new Map(),
  };
  const ctx = buildContext([{ type: "integer", value: 42 }, properties]);

  const result = dpHandler(ctx);

  assert(!result.ok);
  expect(MarkedContentStack.depth(ctx.markedContentStack)).toBe(0);
});

test("tag TYPE_MISMATCH 時、両方 pop 済みで operandStack depth=0", () => {
  const properties: PdfDictionary = {
    type: "dictionary",
    entries: new Map(),
  };
  const ctx = buildContext([{ type: "integer", value: 42 }, properties]);
  expect(OperandStack.depth(ctx.operandStack)).toBe(2);

  const result = dpHandler(ctx);

  assert(!result.ok);
  expect(OperandStack.depth(ctx.operandStack)).toBe(0);
});

test("MISSING actual=1 時、properties 側は pop 済みで operandStack depth=0 のまま（復元されない）", () => {
  // properties 位置に name を 1 個だけ push した状態で DP を呼ぶと、
  // properties は pop 成功するが tag pop で MISSING actual=1 になる。
  // このとき properties は既に pop 済みで operandStack は空。
  // BDC handler と同じく、エラー時の operand 復元は行わない規約の pin down。
  const ctx = buildContext([{ type: "name", value: "Span" }]);
  expect(OperandStack.depth(ctx.operandStack)).toBe(1);

  const result = dpHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.actual).toBe(1);
  expect(OperandStack.depth(ctx.operandStack)).toBe(0);
});
