import { expect, test } from "vitest";
import { LineJoin } from "./line-join";

test.each([0, 1, 2] as const)("create(%d)はnを保持する", (n) => {
  expect(LineJoin.create(n)).toBe(n);
});

test("LineJoin.allowed は [0, 1, 2] を保持する", () => {
  expect(LineJoin.allowed).toEqual([0, 1, 2]);
});

test.each([0, 1, 2] as const)("LineJoin.isValid(%d) は true を返す", (n) => {
  expect(LineJoin.isValid(n)).toBe(true);
});

test.each([
  3,
  -1,
  1.5,
  Number.NaN,
  Number.MAX_SAFE_INTEGER,
])("LineJoin.isValid(%s) は false を返す", (n) => {
  expect(LineJoin.isValid(n)).toBe(false);
});
