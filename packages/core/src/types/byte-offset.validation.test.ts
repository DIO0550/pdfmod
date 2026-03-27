import { expect, test } from "vitest";
import { ByteOffset } from "./byte-offset";

test("ByteOffset.create returns Ok for 0", () => {
  const result = ByteOffset.create(0);
  expect(result).toStrictEqual({ ok: true, value: 0 });
});

test("ByteOffset.create returns Ok for positive integer", () => {
  const result = ByteOffset.create(1024);
  expect(result).toStrictEqual({ ok: true, value: 1024 });
});

test.each([
  -1, -100,
])("ByteOffset.create returns Err for negative number %d", (n) => {
  const result = ByteOffset.create(n);
  expect(result.ok).toBe(false);
});

test.each([
  1.5, 0.1,
])("ByteOffset.create returns Err for non-integer %d", (n) => {
  const result = ByteOffset.create(n);
  expect(result.ok).toBe(false);
});

test("ByteOffset.of returns branded value", () => {
  const value: ByteOffset = ByteOffset.of(1024);
  expect(value).toBe(1024);
});

test("ByteOffset.add returns sum of two ByteOffsets", () => {
  const a = ByteOffset.of(100);
  const b = ByteOffset.of(50);
  expect(ByteOffset.add(a, b)).toBe(150);
});

test("ByteOffset.add with zero", () => {
  const a = ByteOffset.of(200);
  const b = ByteOffset.of(0);
  expect(ByteOffset.add(a, b)).toBe(200);
});
