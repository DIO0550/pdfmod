import { test, expect } from "vitest";
import { ok, err } from "./result.js";

test("okは成功結果を生成する", () => {
  const result = ok(42);
  expect(result).toEqual({ ok: true, value: 42 });
});

test("errは失敗結果を生成する", () => {
  const result = err("fail");
  expect(result).toEqual({ ok: false, error: "fail" });
});

test("okのdiscriminantで値にアクセスできる", () => {
  const result = ok(42);
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value).toBe(42);
  }
});

test("errのdiscriminantでエラーにアクセスできる", () => {
  const result = err("fail");
  if (!result.ok) {
    expect(result.error).toBe("fail");
  }
});
