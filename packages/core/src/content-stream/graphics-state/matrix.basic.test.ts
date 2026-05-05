import { expect, test } from "vitest";
import { Matrix } from "./matrix";

test("identityは単位行列[1,0,0,1,0,0]を返す", () => {
  expect(Matrix.identity()).toEqual([1, 0, 0, 1, 0, 0]);
});

test("createは指定された6要素を保持する", () => {
  expect(Matrix.create(2, 0, 0, 3, 10, 20)).toEqual([2, 0, 0, 3, 10, 20]);
});

test.each([
  [1, 2, 3, 4, 5, 6],
  [-1, 0.5, 0, 1, 100, -50],
  [0, 0, 0, 0, 0, 0],
])("create(%d,%d,%d,%d,%d,%d)は値を維持する", (a, b, c, d, e, f) => {
  expect(Matrix.create(a, b, c, d, e, f)).toEqual([a, b, c, d, e, f]);
});

test("identityは呼び出し毎に新しい tuple を返す (singleton ではない)", () => {
  expect(Matrix.identity()).not.toBe(Matrix.identity());
});
