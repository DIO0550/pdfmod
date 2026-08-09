import { assert, expect, test } from "vitest";
import { none } from "../../../../utils/option";
import { parsePdfDate } from "../../pdf-date";

test("D: プレフィックスを欠いた文字列は none を返す", () => {
  expect(parsePdfDate("20230101")).toEqual(none);
});

test.each([
  ["D:2023Z", { y: 2023, mo: 0, d: 1, h: 0, mi: 0, s: 0 }],
  ["D:202306+09'00'", { y: 2023, mo: 4, d: 31, h: 15, mi: 0, s: 0 }],
  ["D:20230615+09'00'", { y: 2023, mo: 5, d: 14, h: 15, mi: 0, s: 0 }],
  ["D:2023061512+09'00'", { y: 2023, mo: 5, d: 15, h: 3, mi: 0, s: 0 }],
  ["D:202306151205+09'00'", { y: 2023, mo: 5, d: 15, h: 3, mi: 5, s: 0 }],
  ["D:20230101000000Z", { y: 2023, mo: 0, d: 1, h: 0, mi: 0, s: 0 }],
  ["D:20230615120530Z", { y: 2023, mo: 5, d: 15, h: 12, mi: 5, s: 30 }],
  ["D:20230615120530+09'00'", { y: 2023, mo: 5, d: 15, h: 3, mi: 5, s: 30 }],
  ["D:20230615120530-05'00'", { y: 2023, mo: 5, d: 15, h: 17, mi: 5, s: 30 }],
  ["D:20230615120530-05'30'", { y: 2023, mo: 5, d: 15, h: 17, mi: 35, s: 30 }],
] as const)("TZ 付き日時 %s を UTC として解釈する", (raw, e) => {
  const result = parsePdfDate(raw);
  assert(result.some);
  expect(result.value.getUTCFullYear()).toBe(e.y);
  expect(result.value.getUTCMonth()).toBe(e.mo);
  expect(result.value.getUTCDate()).toBe(e.d);
  expect(result.value.getUTCHours()).toBe(e.h);
  expect(result.value.getUTCMinutes()).toBe(e.mi);
  expect(result.value.getUTCSeconds()).toBe(e.s);
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
  assert(result.some);
  expect(result.value.getFullYear()).toBe(e.y);
  expect(result.value.getMonth()).toBe(e.mo);
  expect(result.value.getDate()).toBe(e.d);
  expect(result.value.getHours()).toBe(e.h);
  expect(result.value.getMinutes()).toBe(e.mi);
  expect(result.value.getSeconds()).toBe(e.s);
});
