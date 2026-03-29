import { expect, test } from "vitest";
import { fromResult, none } from "../../option/option/index";
import { toOption } from "../to-option/index";
import { err, ok } from "./index";

test("toOptionはOkをSomeに変換する", () => {
  const result = toOption(ok(42));
  expect(result).toEqual({ some: true, value: 42 });
});

test("toOptionはErrをNoneに変換する", () => {
  const result = toOption(err("error"));
  expect(result).toBe(none);
});

test("toOptionはok(null)をNoneに変換する（NonNullable一貫性）", () => {
  const result = toOption(ok(null));
  expect(result).toBe(none);
});

test("toOptionはok(undefined)をNoneに変換する（NonNullable一貫性）", () => {
  const result = toOption(ok(undefined));
  expect(result).toBe(none);
});

// --- falsy値テスト ---

test.each([[0], [false], [""]])("toOption(ok(%s)) はSomeを返す", (value) => {
  const result = toOption(ok(value));
  expect(result).toEqual({ some: true, value });
});

// --- toOption と fromResult の一貫性テスト ---

test("toOption と fromResult は ok(42) で同一の結果を返す", () => {
  expect(toOption(ok(42))).toEqual(fromResult(ok(42)));
});

test("toOption と fromResult は ok(0) で同一の結果を返す", () => {
  expect(toOption(ok(0))).toEqual(fromResult(ok(0)));
});

test("toOption と fromResult は ok(null) で同一の結果を返す", () => {
  expect(toOption(ok(null))).toEqual(fromResult(ok(null)));
});

test("toOption と fromResult は err で同一の結果を返す", () => {
  expect(toOption(err("error"))).toEqual(fromResult(err("error")));
});
