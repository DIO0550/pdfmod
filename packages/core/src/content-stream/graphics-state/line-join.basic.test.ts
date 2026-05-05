import { expect, test } from "vitest";
import { LineJoin } from "./line-join";

test.each([0, 1, 2] as const)("create(%d)はnを保持する", (n) => {
  expect(LineJoin.create(n)).toBe(n);
});
