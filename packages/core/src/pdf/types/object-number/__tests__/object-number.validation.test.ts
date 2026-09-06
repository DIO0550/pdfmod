import { expect, test } from "vitest";
import { ObjectNumber } from "../index";

test("ObjectNumber.create は ISO 32000-1 §7.3.10 に反する 0 を拒否する", () => {
  const result = ObjectNumber.create(0);
  expect(result.ok).toBe(false);
});

test("ObjectNumber.create は 1 を受理する", () => {
  const result = ObjectNumber.create(1);
  expect(result).toStrictEqual({ ok: true, value: 1 });
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

test.each([
  1,
  2,
  Number.MAX_SAFE_INTEGER,
])("ObjectNumber.create は正の safe integer %p を受理する", (n) => {
  const result = ObjectNumber.create(n);
  expect(result).toStrictEqual({ ok: true, value: n });
});

test.each([
  0,
  -1,
  1.5,
  Number.MAX_SAFE_INTEGER + 1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
])("ObjectNumber.create は %p を拒否する", (n) => {
  const result = ObjectNumber.create(n);
  expect(result.ok).toBe(false);
});
