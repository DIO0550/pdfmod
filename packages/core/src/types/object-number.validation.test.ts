import { expect, test } from "vitest";
import { ObjectNumber } from "./object-number";

test("ObjectNumber.create returns Ok for 0", () => {
  const result = ObjectNumber.create(0);
  expect(result).toStrictEqual({ ok: true, value: 0 });
});

test("ObjectNumber.create returns Ok for positive integer", () => {
  const result = ObjectNumber.create(42);
  expect(result).toStrictEqual({ ok: true, value: 42 });
});

test.each([
  -1, -100,
])("ObjectNumber.create returns Err for negative number %d", (n) => {
  const result = ObjectNumber.create(n);
  expect(result.ok).toBe(false);
});

test.each([
  1.5, 0.1,
])("ObjectNumber.create returns Err for non-integer %d", (n) => {
  const result = ObjectNumber.create(n);
  expect(result.ok).toBe(false);
});

test("ObjectNumber.of returns branded value", () => {
  const value: ObjectNumber = ObjectNumber.of(42);
  expect(value).toBe(42);
});
