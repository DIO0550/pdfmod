import { assert, expect, test } from "vitest";
import type {
  PdfName,
  PdfObject,
} from "../../../../../pdf/types/pdf-types/index";
import { none } from "../../../../../utils/option/index";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import type { MarkedContentEntry } from "../../../../marked-content/stack";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { mpHandler } from "../index";

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

test("operand 0 個のとき MISSING を返す（required:1, actual:0, operatorName:'MP'）", () => {
  const ctx = buildContext([]);

  const result = mpHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("MP");
  expect(result.error.required).toBe(1);
  expect(result.error.actual).toBe(0);
});

test("MISSING メッセージは \"Operator 'MP' requires 1 operand(s), got 0\" と完全一致", () => {
  const ctx = buildContext([]);

  const result = mpHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.message).toBe(
    "Operator 'MP' requires 1 operand(s), got 0",
  );
});

test("MISSING 時 markedContentStack は push されず不変（非空 stack で depth=1 のまま）", () => {
  const ctx = buildSeededContext([], { type: "name", value: "Span" });

  const result = mpHandler(ctx);

  assert(!result.ok);
  expect(MarkedContentStack.depth(ctx.markedContentStack)).toBe(1);
});

test.each<[string, PdfObject]>(
  NON_NAME_CASES,
)("top が %s のとき TYPE_MISMATCH を返す（expected:'name', actual=top の type 名）", (type, operand) => {
  const ctx = buildContext([operand]);

  const result = mpHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.expected).toBe("name");
  expect(result.error.actual).toBe(type);
});

test("TYPE_MISMATCH の operatorName が 'MP' でメッセージが完全一致する（top: integer）", () => {
  const ctx = buildContext([{ type: "integer", value: 42 }]);

  const result = mpHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("MP");
  expect(result.error.message).toBe(
    "Operator 'MP' expected name operand, got integer",
  );
});

test("TYPE_MISMATCH 時 markedContentStack は push されず不変（depth 変わらず 0）", () => {
  const ctx = buildContext([{ type: "integer", value: 42 }]);

  const result = mpHandler(ctx);

  assert(!result.ok);
  expect(MarkedContentStack.depth(ctx.markedContentStack)).toBe(0);
});

test("TYPE_MISMATCH 後に部分消費した operand は復元しない（operandStack depth=1 → depth=0 のまま）", () => {
  const ctx = buildContext([{ type: "integer", value: 42 }]);
  expect(OperandStack.depth(ctx.operandStack)).toBe(1);

  const result = mpHandler(ctx);

  assert(!result.ok);
  expect(OperandStack.depth(ctx.operandStack)).toBe(0);
});
