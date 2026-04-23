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

test("isSafeIntegerAtLeastZero: 0 に対して true を返す", () => {
  expect(NumberEx.isSafeIntegerAtLeastZero(0)).toBe(true);
});

test("isSafeIntegerAtLeastZero: 正の安全な整数に対して true を返す", () => {
  expect(NumberEx.isSafeIntegerAtLeastZero(1)).toBe(true);
  expect(NumberEx.isSafeIntegerAtLeastZero(42)).toBe(true);
  expect(NumberEx.isSafeIntegerAtLeastZero(Number.MAX_SAFE_INTEGER)).toBe(true);
});

test("isSafeIntegerAtLeastZero: 負の整数に対して false を返す", () => {
  expect(NumberEx.isSafeIntegerAtLeastZero(-1)).toBe(false);
});

test("isSafeIntegerAtLeastZero: 小数に対して false を返す", () => {
  expect(NumberEx.isSafeIntegerAtLeastZero(1.5)).toBe(false);
  expect(NumberEx.isSafeIntegerAtLeastZero(0.1)).toBe(false);
});

test("isSafeIntegerAtLeastZero: 非有限値に対して false を返す", () => {
  expect(NumberEx.isSafeIntegerAtLeastZero(Infinity)).toBe(false);
  expect(NumberEx.isSafeIntegerAtLeastZero(NaN)).toBe(false);
});

test("isPositiveFinite: 正の有限数に対して true を返す", () => {
  expect(NumberEx.isPositiveFinite(1)).toBe(true);
  expect(NumberEx.isPositiveFinite(2.5)).toBe(true);
  expect(NumberEx.isPositiveFinite(0.001)).toBe(true);
  expect(NumberEx.isPositiveFinite(Number.MAX_VALUE)).toBe(true);
});

test("isPositiveFinite: 0 に対して false を返す", () => {
  expect(NumberEx.isPositiveFinite(0)).toBe(false);
  expect(NumberEx.isPositiveFinite(-0)).toBe(false);
});

test("isPositiveFinite: 負数に対して false を返す", () => {
  expect(NumberEx.isPositiveFinite(-1)).toBe(false);
  expect(NumberEx.isPositiveFinite(-0.5)).toBe(false);
});

test("isPositiveFinite: 非有限値に対して false を返す", () => {
  expect(NumberEx.isPositiveFinite(Number.POSITIVE_INFINITY)).toBe(false);
  expect(NumberEx.isPositiveFinite(Number.NEGATIVE_INFINITY)).toBe(false);
  expect(NumberEx.isPositiveFinite(NaN)).toBe(false);
});
