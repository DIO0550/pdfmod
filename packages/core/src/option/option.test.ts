import { expect, test } from "vitest";
import type { Option } from "./option.js";
import { fromNullable, none, some } from "./option.js";

test("someは{ some: true, value }を生成する", () => {
  const result = some(42);
  expect(result).toEqual({ some: true, value: 42 });
});

test("someはObject.freeze済みである", () => {
  const result = some(42);
  expect(Object.isFrozen(result)).toBe(true);
});

test("noneは{ some: false }である", () => {
  expect(none).toEqual({ some: false });
});

test("noneはObject.freeze済みである", () => {
  expect(Object.isFrozen(none)).toBe(true);
});

test("noneはシングルトンである", () => {
  const a = none;
  const b = none;
  expect(a).toBe(b);
});

test("fromNullableは有効値に対してSomeを返す", () => {
  const result = fromNullable(42);
  expect(result).toEqual({ some: true, value: 42 });
});

test("fromNullableはnullに対してNoneを返す", () => {
  const result = fromNullable(null);
  expect(result).toBe(none);
});

test("fromNullableはundefinedに対してNoneを返す", () => {
  const result = fromNullable(undefined);
  expect(result).toBe(none);
});

test("discriminantによる型絞り込みができる", () => {
  const opt: Option<number> = some(42);
  if (opt.some) {
    expect(opt.value).toBe(42);
  }
});
