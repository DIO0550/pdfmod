import { expect, test } from "vitest";
import { GenerationNumber } from "./index";

test("GenerationNumber.create returns Ok for 0", () => {
  const result = GenerationNumber.create(0);
  expect(result).toStrictEqual({ ok: true, value: 0 });
});

test("GenerationNumber.create returns Ok for 65535", () => {
  const result = GenerationNumber.create(65535);
  expect(result).toStrictEqual({ ok: true, value: 65535 });
});

test.each([
  -1, -100,
])("GenerationNumber.create returns Err for negative number %d", (n) => {
  const result = GenerationNumber.create(n);
  expect(result.ok).toBe(false);
});

test("GenerationNumber.create returns Err for 65536", () => {
  const result = GenerationNumber.create(65536);
  expect(result.ok).toBe(false);
});

test.each([
  1.5, 0.1,
])("GenerationNumber.create returns Err for non-integer %d", (n) => {
  const result = GenerationNumber.create(n);
  expect(result.ok).toBe(false);
});

test("GenerationNumber.of returns branded value", () => {
  const value: GenerationNumber = GenerationNumber.of(0);
  expect(value).toBe(0);
});
