import { test, expect } from "vitest";
import { ok, err, map, flatMap, mapErr, unwrapOr } from "./result.js";
import type { Result } from "./result.js";

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
  expect(flatMap(err("fail") as Result<number, string>, double)).toEqual({
    ok: false,
    error: "fail",
  });
});

test("flatMapは関数からのerrを伝播する", () => {
  const fail = (_n: number): Result<number, string> => err("inner fail");
  expect(flatMap(ok(5), fail)).toEqual({ ok: false, error: "inner fail" });
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

test.each([
  [ok(42), 0, 42],
  [err("fail"), 0, 0],
] as const)("unwrapOrは%oに対してデフォルト値%iで%iを返す", (result, defaultVal, expected) => {
  expect(unwrapOr(result as Result<number, string>, defaultVal)).toBe(expected);
});
