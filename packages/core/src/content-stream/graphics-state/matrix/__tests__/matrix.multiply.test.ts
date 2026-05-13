import { expect, test } from "vitest";
import { Matrix } from "../../matrix";

test("identity × M は M を返す（左中立）", () => {
  const m = Matrix.create(2, 0, 0, 3, 10, 20);
  expect(Matrix.multiply(Matrix.identity(), m)).toEqual([2, 0, 0, 3, 10, 20]);
});

test("M × identity は M を返す（右中立）", () => {
  const m = Matrix.create(2, 0, 0, 3, 10, 20);
  expect(Matrix.multiply(m, Matrix.identity())).toEqual([2, 0, 0, 3, 10, 20]);
});

test("平行移動の合成: T(10,20) × T(5,7) = T(15,27)", () => {
  const t1 = Matrix.create(1, 0, 0, 1, 10, 20);
  const t2 = Matrix.create(1, 0, 0, 1, 5, 7);
  expect(Matrix.multiply(t1, t2)).toEqual([1, 0, 0, 1, 15, 27]);
});

test("拡大の合成: S(2,3) × S(4,5) = S(8,15)", () => {
  const s1 = Matrix.create(2, 0, 0, 3, 0, 0);
  const s2 = Matrix.create(4, 0, 0, 5, 0, 0);
  expect(Matrix.multiply(s1, s2)).toEqual([8, 0, 0, 15, 0, 0]);
});

test("90度回転 × 90度回転 = 180度回転 [-1, 0, -0, -1, 0, 0]", () => {
  const r90 = Matrix.create(0, 1, -1, 0, 0, 0);
  expect(Matrix.multiply(r90, r90)).toEqual([-1, 0, -0, -1, 0, 0]);
});

test("multiply は非可換 (left × right ≠ right × left)", () => {
  const t = Matrix.create(1, 0, 0, 1, 10, 0);
  const s = Matrix.create(2, 0, 0, 2, 0, 0);
  expect(Matrix.multiply(t, s)).not.toEqual(Matrix.multiply(s, t));
});

test("元の left / right は mutate されない（値が保たれる）", () => {
  const left = Matrix.create(1, 2, 3, 4, 5, 6);
  const right = Matrix.create(7, 8, 9, 10, 11, 12);
  Matrix.multiply(left, right);
  expect(left).toEqual([1, 2, 3, 4, 5, 6]);
  expect(right).toEqual([7, 8, 9, 10, 11, 12]);
});
