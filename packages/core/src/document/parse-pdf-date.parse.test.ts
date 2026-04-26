import { expect, test } from "vitest";
import { parsePdfDate } from "./parse-pdf-date";

test("D: プレフィックスを欠いた文字列は undefined を返す", () => {
  expect(parsePdfDate("20230101")).toBeUndefined();
});

test("D:2023 はローカル 2023-01-01 00:00:00 にパースされる", () => {
  const result = parsePdfDate("D:2023");
  expect(result).toBeDefined();
  expect(result?.getFullYear()).toBe(2023);
  expect(result?.getMonth()).toBe(0);
  expect(result?.getDate()).toBe(1);
  expect(result?.getHours()).toBe(0);
  expect(result?.getMinutes()).toBe(0);
  expect(result?.getSeconds()).toBe(0);
});
