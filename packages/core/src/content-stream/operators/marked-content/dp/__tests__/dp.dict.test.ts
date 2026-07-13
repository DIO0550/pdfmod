import { assert, expect, test } from "vitest";
import type {
  PdfDictionary,
  PdfName,
  PdfObject,
  PdfValue,
} from "../../../../../pdf/types/pdf-types/index";
import { none } from "../../../../../utils/option/index";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import type { MarkedContentEntry } from "../../../../marked-content/stack";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { dpHandler } from "../index";

// buildContext は operand を底 → 頂上の順に push する。pop 順は逆。
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

// markedContentStack を depth=1 の非空状態にして組み立てる（push しないことの pin down 用）
const buildNestedContext = (
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

test("tag + dict properties を受理して ok を返す", () => {
  const tag: PdfName = { type: "name", value: "Span" };
  const properties: PdfDictionary = {
    type: "dictionary",
    entries: new Map([["MCID", { type: "integer", value: 0 }]]),
  };
  const ctx = buildContext([tag, properties]);

  const result = dpHandler(ctx);

  assert(result.ok);
});

test("成功時 markedContentStack は入力と同一参照で返る（BDC との本質的差分 / push しない）", () => {
  const tag: PdfName = { type: "name", value: "Span" };
  const properties: PdfDictionary = {
    type: "dictionary",
    entries: new Map([["MCID", { type: "integer", value: 0 }]]),
  };
  const ctx = buildContext([tag, properties]);

  const result = dpHandler(ctx);

  assert(result.ok);
  // DP は marked-content point であり BMC/EMC の対を持たないため
  // markedContentStack は入力と同一参照でそのまま返る
  expect(result.value.markedContentStack).toBe(ctx.markedContentStack);
});

test("成功時 markedContentStack の depth が 0 → 0 のまま（push しない）", () => {
  const tag: PdfName = { type: "name", value: "Span" };
  const properties: PdfDictionary = {
    type: "dictionary",
    entries: new Map(),
  };
  const ctx = buildContext([tag, properties]);

  const result = dpHandler(ctx);

  assert(result.ok);
  expect(MarkedContentStack.depth(result.value.markedContentStack)).toBe(0);
});

test("成功後も入力 ctx.markedContentStack は非破壊で depth=0 のまま", () => {
  const tag: PdfName = { type: "name", value: "Span" };
  const properties: PdfDictionary = {
    type: "dictionary",
    entries: new Map(),
  };
  const ctx = buildContext([tag, properties]);

  const result = dpHandler(ctx);

  assert(result.ok);
  expect(MarkedContentStack.depth(ctx.markedContentStack)).toBe(0);
});

test("dict の中身（/MCID 0, /ActualText (fi)）はそのまま保持され検証されない", () => {
  const tag: PdfName = { type: "name", value: "Span" };
  const properties: PdfDictionary = {
    type: "dictionary",
    entries: new Map<string, PdfValue>([
      ["MCID", { type: "integer", value: 0 }],
      [
        "ActualText",
        {
          type: "string",
          value: new Uint8Array([0x66, 0x69]),
          encoding: "literal",
        },
      ],
    ]),
  };
  const ctx = buildContext([tag, properties]);

  const result = dpHandler(ctx);

  assert(result.ok);
  // DP は markedContentStack を差し替えないため、dict の中身は handler の関知外。
  // 同一参照返しであることで「中身検証も加工もしていない」ことを pin down する。
  expect(result.value.markedContentStack).toBe(ctx.markedContentStack);
});

test("空 dict `<<>>` でも受理する（中身検証なしの pin down）", () => {
  const tag: PdfName = { type: "name", value: "Span" };
  const properties: PdfDictionary = {
    type: "dictionary",
    entries: new Map(),
  };
  const ctx = buildContext([tag, properties]);

  const result = dpHandler(ctx);

  assert(result.ok);
});

test("成功時 operandStack は入力と同一参照（in-place mutate）", () => {
  const tag: PdfName = { type: "name", value: "Span" };
  const properties: PdfDictionary = {
    type: "dictionary",
    entries: new Map(),
  };
  const ctx = buildContext([tag, properties]);

  const result = dpHandler(ctx);

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
});

test("成功時 operand が 2 個消費され operandStack depth=0 になる", () => {
  const tag: PdfName = { type: "name", value: "Span" };
  const properties: PdfDictionary = {
    type: "dictionary",
    entries: new Map(),
  };
  const ctx = buildContext([tag, properties]);

  const result = dpHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("成功時 graphicsStateStack は入力と同一参照で返る", () => {
  const tag: PdfName = { type: "name", value: "Span" };
  const properties: PdfDictionary = {
    type: "dictionary",
    entries: new Map(),
  };
  const ctx = buildContext([tag, properties]);

  const result = dpHandler(ctx);

  assert(result.ok);
  expect(result.value.graphicsStateStack).toBe(ctx.graphicsStateStack);
});

test("余剰 operand があるとき末尾 2 個のみ消費する（depth=4 → depth=2）", () => {
  const surplus0: PdfObject = { type: "integer", value: 1 };
  const surplus1: PdfObject = { type: "integer", value: 2 };
  const tag: PdfName = { type: "name", value: "Span" };
  const properties: PdfDictionary = {
    type: "dictionary",
    entries: new Map(),
  };
  const ctx = buildContext([surplus0, surplus1, tag, properties]);

  const result = dpHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(2);
  const top = OperandStack.peek(result.value.operandStack);
  assert(top.some);
  expect(top.value).toEqual(surplus1);
});

test("既存 seeded stack (depth=1) でも depth=1 のまま（push しない / BDC は 1→2）", () => {
  const seededTag: PdfName = { type: "name", value: "Artifact" };
  const tag: PdfName = { type: "name", value: "Span" };
  const properties: PdfDictionary = {
    type: "dictionary",
    entries: new Map(),
  };
  const ctx = buildNestedContext([tag, properties], seededTag);

  const result = dpHandler(ctx);

  assert(result.ok);
  // seeded depth=1 の状態で DP を呼んでも push されないため depth=1 のまま。
  // BDC なら 1→2 になるが、DP は marked-content point のため加算しない。
  expect(MarkedContentStack.depth(result.value.markedContentStack)).toBe(1);
});
