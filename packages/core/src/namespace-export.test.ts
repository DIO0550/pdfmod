import { test, expect } from "vitest";
import { Result, Option } from "./index.js";

test("Result.okがランタイムで動作する", () => {
  const result = Result.ok(42);
  expect(result).toEqual({ ok: true, value: 42 });
});

test("Result.errがランタイムで動作する", () => {
  const result = Result.err("fail");
  expect(result).toEqual({ ok: false, error: "fail" });
});

test("Result.mapがランタイムで動作する", () => {
  const result = Result.map(Result.ok(2), (x) => x * 3);
  expect(result).toEqual({ ok: true, value: 6 });
});

test("Option.someがランタイムで動作する", () => {
  const result = Option.some(42);
  expect(result).toEqual({ some: true, value: 42 });
});

test("Option.noneがランタイムで動作する", () => {
  expect(Option.none).toEqual({ some: false });
});

test("Option.mapがランタイムで動作する", () => {
  const result = Option.map(Option.some(2), (x) => x * 3);
  expect(result).toEqual({ some: true, value: 6 });
});

test("Result.Result型が参照できる", () => {
  const r: Result.Result<number, string> = Result.ok(42);
  expect(r.ok).toBe(true);
});

test("Option.Option型が参照できる", () => {
  const o: Option.Option<number> = Option.some(42);
  expect(o.some).toBe(true);
});
