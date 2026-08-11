import { expect, test } from "vitest";
import { ObjectNumber } from "../../../pdf/types/object-number/index";

const a = ObjectNumber.of(10);
const b = ObjectNumber.of(20);

test.each([
  { name: "加算", actual: a + b, expected: 30 },
  { name: "減算", actual: b - a, expected: 10 },
  { name: "乗算", actual: a * 2, expected: 20 },
  { name: "除算", actual: b / 2, expected: 10 },
])("Brand 型の値は$nameに使用できる", ({ actual, expected }) => {
  expect(actual).toBe(expected);
});
