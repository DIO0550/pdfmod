import { assert, expect, test } from "vitest";
import { Uint8ArrayEx } from "../index";

test("matchesAt: 指定位置で一致する場合に true を返す", () => {
  const data = new Uint8Array([1, 2, 3, 4, 5]);
  expect(Uint8ArrayEx.matchesAt(data, 1, [2, 3])).toBe(true);
  expect(Uint8ArrayEx.matchesAt(data, 1, new Uint8Array([2, 3]))).toBe(true);
  expect(Uint8ArrayEx.matchesAt(data, 0, [1])).toBe(true);
  expect(Uint8ArrayEx.matchesAt(data, 4, [5])).toBe(true);
});

test("matchesAt: 不一致または範囲外の場合に false を返す", () => {
  const data = new Uint8Array([1, 2, 3, 4, 5]);
  expect(Uint8ArrayEx.matchesAt(data, 1, [2, 4])).toBe(false);
  expect(Uint8ArrayEx.matchesAt(data, 4, [5, 6])).toBe(false);
  expect(Uint8ArrayEx.matchesAt(data, 5, [1])).toBe(false);
  expect(Uint8ArrayEx.matchesAt(data, -1, [1])).toBe(false);
});

test("indexOf: 先頭または途中で見つかる場合に some(index) を返す", () => {
  const data = new Uint8Array([0x20, 0x20, 0x25, 0x50, 0x44, 0x46, 0x2d]);
  const pattern = [0x25, 0x50, 0x44, 0x46, 0x2d];
  const result = Uint8ArrayEx.indexOf(data, pattern);
  assert(result.some);
  expect(result.value).toBe(2);

  const headResult = Uint8ArrayEx.indexOf(data, [0x20]);
  assert(headResult.some);
  expect(headResult.value).toBe(0);
});

test("indexOf: toIndex の範囲外にある場合は none を返す", () => {
  const data = new Uint8Array([0x20, 0x20, 0x25, 0x50, 0x44, 0x46, 0x2d]);
  const pattern = [0x25, 0x50, 0x44, 0x46, 0x2d];
  // インデックス 2 から始まるが、toIndex = 2 の場合は範囲外
  expect(Uint8ArrayEx.indexOf(data, pattern, 0, 2).some).toBe(false);
  // toIndex = 7 であれば範囲内
  const inRange = Uint8ArrayEx.indexOf(data, pattern, 0, 7);
  assert(inRange.some);
  expect(inRange.value).toBe(2);
});

test("indexOf: パターンが見つからない、または空データの場合に none を返す", () => {
  const data = new Uint8Array([1, 2, 3]);
  expect(Uint8ArrayEx.indexOf(data, [4, 5]).some).toBe(false);

  const empty = new Uint8Array([]);
  expect(Uint8ArrayEx.indexOf(empty, [1]).some).toBe(false);
});
