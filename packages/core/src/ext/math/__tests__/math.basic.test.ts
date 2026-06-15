import { expect, test } from "vitest";
import { MathEx } from "../index";

// 千分の一単位を 1 単位スケールに変換する基本ケース。
test("fromThousandths は n / 1000 を返す", () => {
  expect(MathEx.fromThousandths(1000)).toBe(1);
  expect(MathEx.fromThousandths(500)).toBe(0.5);
  expect(MathEx.fromThousandths(40)).toBeCloseTo(0.04);
});

// 0 と負数の境界。
test("fromThousandths は 0 で 0、負数で符号を保つ", () => {
  expect(MathEx.fromThousandths(0)).toBe(0);
  expect(MathEx.fromThousandths(-1000)).toBe(-1);
  expect(MathEx.fromThousandths(-50)).toBeCloseTo(-0.05);
});

// 百分率を比率に変換する基本ケース。
test("fromPercent は n / 100 を返す", () => {
  expect(MathEx.fromPercent(100)).toBe(1);
  expect(MathEx.fromPercent(200)).toBe(2);
  expect(MathEx.fromPercent(50)).toBe(0.5);
});

// 0 と負数の境界。
test("fromPercent は 0 で 0、負数で符号を保つ", () => {
  expect(MathEx.fromPercent(0)).toBe(0);
  expect(MathEx.fromPercent(-100)).toBe(-1);
});
