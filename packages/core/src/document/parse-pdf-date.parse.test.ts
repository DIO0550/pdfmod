import { expect, test } from "vitest";
import { parsePdfDate } from "./parse-pdf-date";

test("D: プレフィックスを欠いた文字列は undefined を返す", () => {
  expect(parsePdfDate("20230101")).toBeUndefined();
});

test("D:20230101000000Z は UTC 2023-01-01 00:00:00 にパースされる", () => {
  const result = parsePdfDate("D:20230101000000Z");
  expect(result).toBeDefined();
  expect(result?.getUTCFullYear()).toBe(2023);
  expect(result?.getUTCMonth()).toBe(0);
  expect(result?.getUTCDate()).toBe(1);
  expect(result?.getUTCHours()).toBe(0);
  expect(result?.getUTCMinutes()).toBe(0);
  expect(result?.getUTCSeconds()).toBe(0);
});

test.each([
  ["D:2023", { y: 2023, mo: 0, d: 1, h: 0, mi: 0, s: 0 }],
  ["D:202306", { y: 2023, mo: 5, d: 1, h: 0, mi: 0, s: 0 }],
  ["D:20230615", { y: 2023, mo: 5, d: 15, h: 0, mi: 0, s: 0 }],
  ["D:20230615120530", { y: 2023, mo: 5, d: 15, h: 12, mi: 5, s: 30 }],
  ["D:1000", { y: 1000, mo: 0, d: 1, h: 0, mi: 0, s: 0 }],
  ["D:9999", { y: 9999, mo: 0, d: 1, h: 0, mi: 0, s: 0 }],
  ["D:20240229", { y: 2024, mo: 1, d: 29, h: 0, mi: 0, s: 0 }],
] as const)("TZ なし日時 %s をローカル時刻として解釈する", (raw, e) => {
  const result = parsePdfDate(raw);
  expect(result).toBeDefined();
  expect(result?.getFullYear()).toBe(e.y);
  expect(result?.getMonth()).toBe(e.mo);
  expect(result?.getDate()).toBe(e.d);
  expect(result?.getHours()).toBe(e.h);
  expect(result?.getMinutes()).toBe(e.mi);
  expect(result?.getSeconds()).toBe(e.s);
});
