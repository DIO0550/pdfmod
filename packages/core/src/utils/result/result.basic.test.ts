import { expect, test } from "vitest";
import { err, ok, unwrapOr } from "./index";

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
  expect((result as { ok: true; value: number }).value).toBe(42);
});

test("errのdiscriminantでエラーにアクセスできる", () => {
  const result = err("fail");
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: string }).error).toBe("fail");
});

// --- falsy値テスト ---

test.each([[0], [false], [""]])("ok(%s) は ok: true を返す", (value) => {
  const result = ok(value);
  expect(result).toEqual({ ok: true, value });
});

test("unwrapOr(ok(0), 1) は 0 を返す", () => {
  expect(unwrapOr(ok(0), 1)).toBe(0);
});
