import { expect, test } from "vitest";
import { StringEx } from "./index";

test("toSafeIntegerAtLeastZero: 0 に対して 0 を返す", () => {
  expect(StringEx.toSafeIntegerAtLeastZero("0")).toBe(0);
});

test("toSafeIntegerAtLeastZero: 正の整数文字列に対して数値を返す", () => {
  expect(StringEx.toSafeIntegerAtLeastZero("1")).toBe(1);
  expect(StringEx.toSafeIntegerAtLeastZero("42")).toBe(42);
});

test("toSafeIntegerAtLeastZero: 負の整数文字列に対して undefined を返す", () => {
  expect(StringEx.toSafeIntegerAtLeastZero("-1")).toBeUndefined();
});

test("toSafeIntegerAtLeastZero: 小数文字列に対して undefined を返す", () => {
  expect(StringEx.toSafeIntegerAtLeastZero("1.5")).toBeUndefined();
});

test("toSafeIntegerAtLeastZero: 非数値文字列に対して undefined を返す", () => {
  expect(StringEx.toSafeIntegerAtLeastZero("abc")).toBeUndefined();
  expect(StringEx.toSafeIntegerAtLeastZero("")).toBeUndefined();
});

test("toSafeIntegerAtLeastZero: 先頭ゼロ付き文字列に対して数値を返す", () => {
  expect(StringEx.toSafeIntegerAtLeastZero("007")).toBe(7);
});

test("toSafeIntegerAtLeastZero: 空白を含む文字列に対して undefined を返す", () => {
  expect(StringEx.toSafeIntegerAtLeastZero(" 1")).toBeUndefined();
  expect(StringEx.toSafeIntegerAtLeastZero("1 ")).toBeUndefined();
});
