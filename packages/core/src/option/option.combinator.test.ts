import { expect, test } from "vitest";
import { flatMap, map, none, some, unwrapOr } from "./option.js";

test("mapはSomeに対して関数を適用し新しいSomeを返す", () => {
  const result = map(some(2), (x) => x * 3);
  expect(result).toEqual({ some: true, value: 6 });
});

test("mapはNoneに対してNoneをそのまま返す", () => {
  const result = map(none, (x: number) => x * 3);
  expect(result).toBe(none);
});

test("mapはfnがnullを返す場合Noneを返す", () => {
  const result = map(some(2), () => null);
  expect(result).toBe(none);
});

test("flatMapはSomeに対してfnがSomeを返す場合Someを返す", () => {
  const result = flatMap(some(2), (x) => some(x * 3));
  expect(result).toEqual({ some: true, value: 6 });
});

test("flatMapはSomeに対してfnがNoneを返す場合Noneを返す", () => {
  const result = flatMap(some(2), () => none);
  expect(result).toBe(none);
});

test("flatMapはNoneに対してNoneをそのまま返す", () => {
  const result = flatMap(none, (x: number) => some(x * 3));
  expect(result).toBe(none);
});

test("unwrapOrはSomeからvalueを取得する", () => {
  const result = unwrapOr(some(42), 0);
  expect(result).toBe(42);
});

test("unwrapOrはNoneからdefaultValueを取得する", () => {
  const result = unwrapOr(none, 0);
  expect(result).toBe(0);
});
