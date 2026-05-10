import { expect, test } from "vitest";
import { LineCap } from "./line-cap";

test.each([0, 1, 2] as const)("create(%d)はnを保持する", (n) => {
  expect(LineCap.create(n)).toBe(n);
});

test("LineCap.allowed は [0, 1, 2] を保持する", () => {
  expect(LineCap.allowed).toEqual([0, 1, 2]);
});

test.each([0, 1, 2] as const)("LineCap.isValid(%d) は true を返す", (n) => {
  expect(LineCap.isValid(n)).toBe(true);
});

test.each([
  3,
  -1,
  1.5,
  Number.NaN,
  Number.MAX_SAFE_INTEGER,
])("LineCap.isValid(%s) は false を返す", (n) => {
  expect(LineCap.isValid(n)).toBe(false);
});
