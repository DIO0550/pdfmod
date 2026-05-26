import { expect, test } from "vitest";
import { TextRenderingMode } from "../../text-rendering-mode";

test.each([0, 1, 2, 3, 4, 5, 6, 7] as const)("create(%d)はnを保持する", (n) => {
  expect(TextRenderingMode.create(n)).toBe(n);
});

test("TextRenderingMode.allowed は [0,1,2,3,4,5,6,7] を保持する", () => {
  expect(TextRenderingMode.allowed).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
});

test.each([
  0, 1, 2, 3, 4, 5, 6, 7,
] as const)("TextRenderingMode.isValid(%d) は true を返す", (n) => {
  expect(TextRenderingMode.isValid(n)).toBe(true);
});

test.each([
  8,
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.MAX_SAFE_INTEGER,
])("TextRenderingMode.isValid(%s) は false を返す", (n) => {
  expect(TextRenderingMode.isValid(n)).toBe(false);
});
