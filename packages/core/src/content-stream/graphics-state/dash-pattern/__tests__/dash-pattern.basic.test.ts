import { expect, test } from "vitest";
import { DashPattern } from "../../dash-pattern";

test("DashPattern.solid() は array が空配列で phase が 0", () => {
  expect(DashPattern.solid()).toEqual({ array: [], phase: 0 });
});

test("DashPattern.create([], 0) は空配列と phase を保持する", () => {
  expect(DashPattern.create([], 0)).toEqual({ array: [], phase: 0 });
});

test("DashPattern.create は複数要素の array と phase を保持する", () => {
  expect(DashPattern.create([2, 1, 4, 3], 5)).toEqual({
    array: [2, 1, 4, 3],
    phase: 5,
  });
});

test("DashPattern.create の array は引数と別配列参照", () => {
  const source = [2, 1];
  expect(DashPattern.create(source, 0).array).not.toBe(source);
});

test("引数の配列を後から変更しても DashPattern.array は変化しない", () => {
  const source = [2, 1];
  const pattern = DashPattern.create(source, 0);
  source.push(4, 3);
  expect(pattern.array).toEqual([2, 1]);
});

test("solid() は共有配列を返さない (array を変更しても次の solid() は空配列)", () => {
  const leaked = DashPattern.solid().array as number[];
  leaked.push(2, 1);
  expect(DashPattern.solid()).toEqual({ array: [], phase: 0 });
});
