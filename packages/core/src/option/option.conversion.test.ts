import { test, expect } from "vitest";
import { some, none, toResult, fromResult } from "./option.js";
import { ok, err } from "../result/result.js";

test("toResultはSomeをOkに変換する", () => {
  const result = toResult(some(42), "error");
  expect(result).toEqual({ ok: true, value: 42 });
});

test("toResultはNoneをErrに変換する", () => {
  const result = toResult(none, "error");
  expect(result).toEqual({ ok: false, error: "error" });
});

test("fromResultはOkをSomeに変換する", () => {
  const result = fromResult(ok(42));
  expect(result).toEqual({ some: true, value: 42 });
});

test("fromResultはErrをNoneに変換する", () => {
  const result = fromResult(err("error"));
  expect(result).toBe(none);
});

test("fromResultはok(null)をNoneに変換する（NonNullable一貫性）", () => {
  const result = fromResult(ok(null));
  expect(result).toBe(none);
});

test("fromResultはok(undefined)をNoneに変換する（NonNullable一貫性）", () => {
  const result = fromResult(ok(undefined));
  expect(result).toBe(none);
});
