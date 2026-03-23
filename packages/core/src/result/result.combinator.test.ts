import { expect, test, vi } from "vitest";
import type { Result } from "./result.js";
import { err, flatMap, map, mapErr, ok, unwrapOr } from "./result.js";

// map

test("mapはok値を変換する", () => {
  const result = map(ok(2), (v) => v * 3);
  expect(result).toEqual({ ok: true, value: 6 });
});

test("mapはerrをそのまま返す", () => {
  const result = map(err("fail"), (v: number) => v * 3);
  expect(result).toEqual({ ok: false, error: "fail" });
});

// flatMap

test("flatMapはok結果をチェーンする", () => {
  const double = (n: number): Result<number, string> => ok(n * 2);
  expect(flatMap(ok(5), double)).toEqual({ ok: true, value: 10 });
});

test("flatMapはerrで短絡する", () => {
  const double = (n: number): Result<number, string> => ok(n * 2);
  expect(flatMap(err<string>("fail"), double)).toEqual({
    ok: false,
    error: "fail",
  });
});

test("flatMapは関数からのerrを伝播する", () => {
  expect(flatMap(ok(5), () => err("inner fail"))).toEqual({
    ok: false,
    error: "inner fail",
  });
});

// mapErr

test("mapErrはerr値を変換する", () => {
  const result = mapErr(err("fail"), (e) => `wrapped: ${e}`);
  expect(result).toEqual({ ok: false, error: "wrapped: fail" });
});

test("mapErrはokをそのまま返す", () => {
  const result = mapErr(ok(42), (e: string) => `wrapped: ${e}`);
  expect(result).toEqual({ ok: true, value: 42 });
});

// unwrapOr

test("unwrapOrはokから値を取り出す", () => {
  expect(unwrapOr(ok(42), 0)).toBe(42);
});

test("unwrapOrはerrに対してデフォルト値を返す", () => {
  expect(unwrapOr(err("fail"), 0)).toBe(0);
});

// --- コールバック非実行テスト ---

test("mapはerrに対してfnを呼ばない", () => {
  const fn = vi.fn();
  map(err("e"), fn);
  expect(fn).not.toHaveBeenCalled();
});

test("flatMapはerrに対してfnを呼ばない", () => {
  const fn = vi.fn();
  flatMap(err("e"), fn);
  expect(fn).not.toHaveBeenCalled();
});

test("mapErrはokに対してfnを呼ばない", () => {
  const fn = vi.fn();
  mapErr(ok(1), fn);
  expect(fn).not.toHaveBeenCalled();
});

test("mapはfnが例外を投げた場合そのまま伝播する", () => {
  const error = new Error("test error");
  expect(() =>
    map(ok(1), () => {
      throw error;
    }),
  ).toThrow(error);
});
