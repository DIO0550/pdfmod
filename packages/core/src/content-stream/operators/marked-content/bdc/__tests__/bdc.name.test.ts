import { assert, expect, test } from "vitest";
import type {
  PdfName,
  PdfObject,
} from "../../../../../pdf/types/pdf-types/index";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { bdcHandler } from "../index";

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

test("tag + name properties (/MC0) を受理して ok を返す", () => {
  const tag: PdfName = { type: "name", value: "Span" };
  const properties: PdfName = { type: "name", value: "MC0" };
  const ctx = buildContext([tag, properties]);

  const result = bdcHandler(ctx);

  assert(result.ok);
});

test("push された entry の properties は some(name) で resource 解決されず /MC0 のまま", () => {
  const tag: PdfName = { type: "name", value: "Span" };
  const properties: PdfName = { type: "name", value: "MC0" };
  const ctx = buildContext([tag, properties]);

  const result = bdcHandler(ctx);

  assert(result.ok);
  const popped = MarkedContentStack.pop(result.value.markedContentStack);
  assert(popped.some);
  assert(popped.value.popped.properties.some);
  expect(popped.value.popped.properties.value).toEqual({
    type: "name",
    value: "MC0",
  });
});

test("entry.tag と entry.properties.value はどちらも PdfName で別インスタンス", () => {
  const tag: PdfName = { type: "name", value: "Span" };
  const properties: PdfName = { type: "name", value: "MC0" };
  const ctx = buildContext([tag, properties]);

  const result = bdcHandler(ctx);

  assert(result.ok);
  const popped = MarkedContentStack.pop(result.value.markedContentStack);
  assert(popped.some);
  assert(popped.value.popped.properties.some);
  expect(popped.value.popped.tag).not.toBe(
    popped.value.popped.properties.value,
  );
});

test("空文字 name `//` (value='') を properties として受理する", () => {
  const tag: PdfName = { type: "name", value: "Span" };
  const properties: PdfName = { type: "name", value: "" };
  const ctx = buildContext([tag, properties]);

  const result = bdcHandler(ctx);

  assert(result.ok);
});

test("空文字 tag `//` (value='') でも受理する（値域検証なしの pin down）", () => {
  const tag: PdfName = { type: "name", value: "" };
  const properties: PdfName = { type: "name", value: "MC0" };
  const ctx = buildContext([tag, properties]);

  const result = bdcHandler(ctx);

  assert(result.ok);
});

test("成功時 operandStack が depth=0 まで消費される", () => {
  const tag: PdfName = { type: "name", value: "Span" };
  const properties: PdfName = { type: "name", value: "MC0" };
  const ctx = buildContext([tag, properties]);

  const result = bdcHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});
