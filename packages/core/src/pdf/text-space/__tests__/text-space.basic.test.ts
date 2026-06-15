import { expect, test } from "vitest";
import { TextSpace } from "../index";

// 1000 グリッド単位は 1 em。
test("toEm は 1000 を 1 に変換する", () => {
  expect(TextSpace.toEm(1000)).toBe(1);
});

// AFM 由来の典型例: 文字 'H' のグリフ幅 722 グリッド単位は 0.722 em。
test("toEm は 722 (1 文字の幅例) を 0.722 に変換する", () => {
  expect(TextSpace.toEm(722)).toBeCloseTo(0.722);
});

// TJ 配列の位置調整値 40 は 0.04 em のバックシフト。
test("toEm は TJ 配列値 40 を 0.04 に変換する", () => {
  expect(TextSpace.toEm(40)).toBeCloseTo(0.04);
});

// TJ 配列の数値要素は integer / real のいずれも取り得るため、小数入力も受理する。
test("toEm は小数（real 値）入力も受理する", () => {
  expect(TextSpace.toEm(40.5)).toBeCloseTo(0.0405);
  expect(TextSpace.toEm(-0.5)).toBeCloseTo(-0.0005);
});

// 0 の境界。
test("toEm は 0 を 0 に変換する", () => {
  expect(TextSpace.toEm(0)).toBe(0);
});

// 負数の符号保持。
test("toEm は負数で符号を保つ", () => {
  expect(TextSpace.toEm(-1000)).toBe(-1);
  expect(TextSpace.toEm(-50)).toBeCloseTo(-0.05);
});
