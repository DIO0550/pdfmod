import { expect, expectTypeOf, test } from "vitest";
import { Alpha } from "../index";

test.each([0, 0.5, 1])("不透明度 %s は生成できる", (value) => {
  expect(Alpha.create(value)).toEqual({ some: true, value });
});

test.each([
  -1,
  1.01,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
])("不透明度 %s は生成できない", (value) => {
  expect(Alpha.create(value)).toEqual({ some: false });
});

test("未検証の数値は不透明度へ代入できない", () => {
  expectTypeOf<number>().not.toExtend<Alpha>();
});
