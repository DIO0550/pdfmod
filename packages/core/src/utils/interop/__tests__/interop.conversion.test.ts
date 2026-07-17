import { expect, test } from "vitest";
import { none, some } from "../../option/index";
import { err, ok } from "../../result/index";
import { toOption, toResult } from "../index";

test("toOptionはOkをSomeに変換する", () => {
  const result = toOption(ok(42));
  expect(result).toEqual({ some: true, value: 42 });
});

test("toOptionはErrをNoneに変換する", () => {
  const result = toOption(err("error"));
  expect(result).toBe(none);
});

test.each([[0], [false], [""]])("toOption(ok(%s)) はSomeを返す", (value) => {
  const result = toOption(ok(value));
  expect(result).toEqual({ some: true, value });
});

test("toResultはSomeをOkに変換する", () => {
  const result = toResult(some(42), "missing");
  expect(result).toEqual({ ok: true, value: 42 });
});

test("toResultはNoneを指定エラーのErrに変換する", () => {
  const result = toResult(none, "missing");
  expect(result).toEqual({ ok: false, error: "missing" });
});

test.each([
  [0],
  [false],
  [""],
])("toResult(some(%s), error) はOkを返す", (value) => {
  const result = toResult(some(value), "missing");
  expect(result).toEqual({ ok: true, value });
});

test("toResultとtoOptionの往復で値が保存される", () => {
  const roundTripped = toOption(toResult(some(42), "e"));
  expect(roundTripped).toEqual({ some: true, value: 42 });
});

test("toOptionとtoResultの往復で値が保存される", () => {
  const roundTripped = toResult(toOption(ok(42)), "e");
  expect(roundTripped).toEqual({ ok: true, value: 42 });
});

test("noneはtoResultとtoOptionの往復でnoneに戻る", () => {
  const roundTripped = toOption(toResult<number, string>(none, "e"));
  expect(roundTripped).toBe(none);
});
