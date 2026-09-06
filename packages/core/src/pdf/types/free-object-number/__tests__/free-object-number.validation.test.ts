import { expect, test } from "vitest";
import { FreeObjectNumber } from "../index";

test("FreeObjectNumber.create はリスト終端を表す 0 を受理する", () => {
  const result = FreeObjectNumber.create(0);
  expect(result).toStrictEqual({ ok: true, value: 0 });
});

test("FreeObjectNumber.create は正整数を受理する", () => {
  const result = FreeObjectNumber.create(1);
  expect(result).toStrictEqual({ ok: true, value: 1 });
});

test("FreeObjectNumber.create は safe integer の上限を受理する", () => {
  const result = FreeObjectNumber.create(Number.MAX_SAFE_INTEGER);
  expect(result).toStrictEqual({
    ok: true,
    value: Number.MAX_SAFE_INTEGER,
  });
});

test.each([
  -1,
  0.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
])("FreeObjectNumber.create は %p を拒否する", (n) => {
  const result = FreeObjectNumber.create(n);
  expect(result.ok).toBe(false);
});

test("FreeObjectNumber.of はブランド付きの値を返す", () => {
  const value: FreeObjectNumber = FreeObjectNumber.of(0);
  expect(value).toBe(0);
});
