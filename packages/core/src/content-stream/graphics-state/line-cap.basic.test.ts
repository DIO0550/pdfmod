import { expect, test } from "vitest";
import { LineCap } from "./line-cap";

test.each([0, 1, 2] as const)("create(%d)はnを保持する", (n) => {
  expect(LineCap.create(n)).toBe(n);
});
