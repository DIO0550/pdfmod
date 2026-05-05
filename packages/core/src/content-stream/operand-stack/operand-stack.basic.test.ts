import { expect, test } from "vitest";
import type { PdfObject } from "../../pdf/types/pdf-types/index";
import { OperandStack } from "./index";

const pdfInt = (n: number): PdfObject => ({ type: "integer", value: n });

test("createしたスタックのdepthは0", () => {
  const stack = OperandStack.create();

  expect(OperandStack.depth(stack)).toBe(0);
});

test("pushするとdepthが1増える", () => {
  const stack = OperandStack.create();

  OperandStack.push(stack, pdfInt(42));

  expect(OperandStack.depth(stack)).toBe(1);
});

test("空スタックのpopはnoneを返す", () => {
  const stack = OperandStack.create();

  expect(OperandStack.pop(stack)).toEqual({ some: false });
});

test("popはLIFO順で値を返す", () => {
  const stack = OperandStack.create();
  const a = pdfInt(1);
  const b = pdfInt(2);
  OperandStack.push(stack, a);
  OperandStack.push(stack, b);

  expect(OperandStack.pop(stack)).toEqual({ some: true, value: b });
  expect(OperandStack.pop(stack)).toEqual({ some: true, value: a });
});

test("peekは要素を取り除かずsome(top)を返す", () => {
  const stack = OperandStack.create();
  const value = pdfInt(7);
  OperandStack.push(stack, value);

  expect(OperandStack.peek(stack)).toEqual({ some: true, value });
  expect(OperandStack.depth(stack)).toBe(1);
});

test("空スタックのpeekはnoneを返す", () => {
  const stack = OperandStack.create();

  expect(OperandStack.peek(stack)).toEqual({ some: false });
});

test("clearでdepthが0に戻る", () => {
  const stack = OperandStack.create();
  OperandStack.push(stack, pdfInt(1));
  OperandStack.push(stack, pdfInt(2));
  OperandStack.push(stack, pdfInt(3));

  OperandStack.clear(stack);

  expect(OperandStack.depth(stack)).toBe(0);
});

test("空スタックに対するclearは安全（depth 0 維持）", () => {
  const stack = OperandStack.create();

  OperandStack.clear(stack);

  expect(OperandStack.depth(stack)).toBe(0);
});

test("push 1回→pop 1回でdepthが0に戻る", () => {
  const stack = OperandStack.create();
  OperandStack.push(stack, pdfInt(99));
  OperandStack.pop(stack);

  expect(OperandStack.depth(stack)).toBe(0);
});
