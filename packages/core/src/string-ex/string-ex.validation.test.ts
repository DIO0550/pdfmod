import { expect, test } from "vitest";
import { none, some } from "../option/index";
import { StringEx } from "./index";

test("toSafeIntegerAtLeastZero: 0 に対して some(0) を返す", () => {
  expect(StringEx.toSafeIntegerAtLeastZero("0")).toStrictEqual(some(0));
});

test("toSafeIntegerAtLeastZero: 正の整数文字列に対して some を返す", () => {
  expect(StringEx.toSafeIntegerAtLeastZero("1")).toStrictEqual(some(1));
  expect(StringEx.toSafeIntegerAtLeastZero("42")).toStrictEqual(some(42));
});

test("toSafeIntegerAtLeastZero: 負の整数文字列に対して none を返す", () => {
  expect(StringEx.toSafeIntegerAtLeastZero("-1")).toBe(none);
});

test("toSafeIntegerAtLeastZero: 小数文字列に対して none を返す", () => {
  expect(StringEx.toSafeIntegerAtLeastZero("1.5")).toBe(none);
});

test("toSafeIntegerAtLeastZero: 非数値文字列に対して none を返す", () => {
  expect(StringEx.toSafeIntegerAtLeastZero("abc")).toBe(none);
  expect(StringEx.toSafeIntegerAtLeastZero("")).toBe(none);
});

test("toSafeIntegerAtLeastZero: 先頭ゼロ付き文字列に対して some を返す", () => {
  expect(StringEx.toSafeIntegerAtLeastZero("007")).toStrictEqual(some(7));
});

test("toSafeIntegerAtLeastZero: 空白を含む文字列に対して none を返す", () => {
  expect(StringEx.toSafeIntegerAtLeastZero(" 1")).toBe(none);
  expect(StringEx.toSafeIntegerAtLeastZero("1 ")).toBe(none);
});
