import { expect, test } from "vitest";
import { NumberEx } from "./index";

test("正の安全な整数に対して true を返す", () => {
  expect(NumberEx.isPositiveSafeInteger(1)).toBe(true);
  expect(NumberEx.isPositiveSafeInteger(42)).toBe(true);
  expect(NumberEx.isPositiveSafeInteger(Number.MAX_SAFE_INTEGER)).toBe(true);
});

test("0 に対して false を返す", () => {
  expect(NumberEx.isPositiveSafeInteger(0)).toBe(false);
});

test("負の整数に対して false を返す", () => {
  expect(NumberEx.isPositiveSafeInteger(-1)).toBe(false);
  expect(NumberEx.isPositiveSafeInteger(-100)).toBe(false);
});

test("小数に対して false を返す", () => {
  expect(NumberEx.isPositiveSafeInteger(1.5)).toBe(false);
  expect(NumberEx.isPositiveSafeInteger(0.1)).toBe(false);
});

test("非有限値に対して false を返す", () => {
  expect(NumberEx.isPositiveSafeInteger(Infinity)).toBe(false);
  expect(NumberEx.isPositiveSafeInteger(-Infinity)).toBe(false);
  expect(NumberEx.isPositiveSafeInteger(NaN)).toBe(false);
});

test("安全でない整数に対して false を返す", () => {
  expect(NumberEx.isPositiveSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(
    false,
  );
});
