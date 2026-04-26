import { expect, test } from "vitest";
import { parsePdfDate } from "./parse-pdf-date";

// 本プロジェクトでは `D:` prefix を必須とする厳格仕様を採用している
// （ISO 32000-2:2020 § 7.9.4 では省略可能だが、PDF 日時オブジェクトを
// 誤認しないため `D:` で前置されたものだけを受理する）。
test("D: prefix が欠落した文字列は undefined を返す（本実装の厳格仕様）", () => {
  expect(parsePdfDate("20230101")).toBeUndefined();
});

interface LocalParts {
  readonly y: number;
  readonly mo: number;
  readonly d: number;
  readonly h: number;
  readonly mi: number;
  readonly s: number;
}

const VALID_TZ_NONE: ReadonlyArray<readonly [string, LocalParts]> = [
  ["D:2023", { y: 2023, mo: 0, d: 1, h: 0, mi: 0, s: 0 }],
  ["D:202306", { y: 2023, mo: 5, d: 1, h: 0, mi: 0, s: 0 }],
  ["D:20230615", { y: 2023, mo: 5, d: 15, h: 0, mi: 0, s: 0 }],
  ["D:20230615120530", { y: 2023, mo: 5, d: 15, h: 12, mi: 5, s: 30 }],
  ["D:1000", { y: 1000, mo: 0, d: 1, h: 0, mi: 0, s: 0 }],
  ["D:9999", { y: 9999, mo: 0, d: 1, h: 0, mi: 0, s: 0 }],
  ["D:20240229", { y: 2024, mo: 1, d: 29, h: 0, mi: 0, s: 0 }],
];

test.each(
  VALID_TZ_NONE,
)("TZ なし日時 %s をローカル時刻として解釈する", (raw, expected) => {
  const result = parsePdfDate(raw);
  expect(result).toBeDefined();
  const date = result as Date;
  expect(date.getFullYear()).toBe(expected.y);
  expect(date.getMonth()).toBe(expected.mo);
  expect(date.getDate()).toBe(expected.d);
  expect(date.getHours()).toBe(expected.h);
  expect(date.getMinutes()).toBe(expected.mi);
  expect(date.getSeconds()).toBe(expected.s);
});

const VALID_TZ_AWARE: ReadonlyArray<readonly [string, LocalParts]> = [
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
];

test.each(
  VALID_TZ_AWARE,
)("TZ あり日時 %s を UTC として解釈する", (raw, expected) => {
  const result = parsePdfDate(raw);
  expect(result).toBeDefined();
  const date = result as Date;
  expect(date.getUTCFullYear()).toBe(expected.y);
  expect(date.getUTCMonth()).toBe(expected.mo);
  expect(date.getUTCDate()).toBe(expected.d);
  expect(date.getUTCHours()).toBe(expected.h);
  expect(date.getUTCMinutes()).toBe(expected.mi);
  expect(date.getUTCSeconds()).toBe(expected.s);
});

const INVALID_INPUTS: ReadonlyArray<readonly [string]> = [
  ["20230101"],
  ["D:abcd"],
  ["D:20231345"],
  ["D:20230231"],
  ["D:20230229"],
  ["D:20230231000000+09'00'"],
  ["D:20230101246000"],
  ["D:20230101000061"],
  ["D:20230101000000+25'00'"],
  ["D:0050"],
  ["D:0999"],
  ["D:00500101"],
  ["D:10000"],
  ["D:"],
  ["D:202"],
  ["D:2023011"],
  ["D:2023+"],
  ["D:20230101000000+09'00'extra"],
  ["D:20230101000000+09'00"],
];

test.each(INVALID_INPUTS)("不正な PDF 日時 %s は undefined を返す", (raw) => {
  expect(parsePdfDate(raw)).toBeUndefined();
});
