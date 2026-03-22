import { expect, test } from "vitest";
import { none } from "../option/option.js";
import { err, ok } from "./result.js";
import { toOption } from "./to-option.js";

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
