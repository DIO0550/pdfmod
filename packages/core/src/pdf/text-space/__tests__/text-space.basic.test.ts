import { expect, test } from "vitest";
import { TextSpace } from "../index";

// 1000 thousandths は 1 em（text space unit 1.0）。
test("fromThousandths は 1000 を 1 に変換する", () => {
  expect(TextSpace.fromThousandths(1000)).toBe(1);
});

// AFM 由来の典型例: 文字 'H' の幅 722 thousandths は 0.722 em。
test("fromThousandths は 722 (1 文字の幅例) を 0.722 に変換する", () => {
  expect(TextSpace.fromThousandths(722)).toBeCloseTo(0.722);
});

// TJ 配列の位置調整値 40 は 0.04 em のバックシフト。
test("fromThousandths は TJ 配列値 40 を 0.04 に変換する", () => {
  expect(TextSpace.fromThousandths(40)).toBeCloseTo(0.04);
});

// 0 の境界。
test("fromThousandths は 0 を 0 に変換する", () => {
  expect(TextSpace.fromThousandths(0)).toBe(0);
});

// 負数の符号保持。
test("fromThousandths は負数で符号を保つ", () => {
  expect(TextSpace.fromThousandths(-1000)).toBe(-1);
  expect(TextSpace.fromThousandths(-50)).toBeCloseTo(-0.05);
});
