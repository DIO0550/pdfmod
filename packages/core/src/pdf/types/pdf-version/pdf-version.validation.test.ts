import { expect, test } from "vitest";
import type { Result } from "../../../utils/result/index";
import { PdfVersion } from "./index";

const unwrapOk = <T>(result: Result<T, unknown>): T => {
  expect(result.ok).toBe(true);
  return (result as { ok: true; value: T }).value;
};

test.each([
  "1.7",
  "2.0",
  "1.10",
  "0.0",
  "10.20",
])("PdfVersion.create returns Ok for valid string %s", (s) => {
  const result = PdfVersion.create(s);
  expect(result.ok).toBe(true);
});

test.each([
  "1",
  "1.x",
  "x.1",
  "1.2.3",
  "",
  " 1.7",
  "1.7 ",
  "1.-1",
  "1.",
  ".7",
])("PdfVersion.create returns Err for invalid string %s", (s) => {
  const result = PdfVersion.create(s);
  expect(result.ok).toBe(false);
});

test.each([
  ["1.7", "1.7", 0],
  ["0.0", "0.0", 0],
  ["2.0", "2.0", 0],
])("PdfVersion.compare(%s, %s) returns 0 (equal)", (a, b, _expected) => {
  const va = unwrapOk(PdfVersion.create(a));
  const vb = unwrapOk(PdfVersion.create(b));
  expect(PdfVersion.compare(va, vb)).toBe(0);
});

test.each([
  ["1.5", "1.7"],
  ["1.0", "1.10"],
  ["1.99", "2.0"],
  ["0.9", "1.0"],
])("PdfVersion.compare(%s, %s) returns negative (a < b)", (a, b) => {
  const va = unwrapOk(PdfVersion.create(a));
  const vb = unwrapOk(PdfVersion.create(b));
  expect(PdfVersion.compare(va, vb)).toBeLessThan(0);
});

test.each([
  ["1.7", "1.5"],
  ["1.10", "1.7"],
  ["2.0", "1.99"],
  ["1.0", "0.9"],
])("PdfVersion.compare(%s, %s) returns positive (a > b)", (a, b) => {
  const va = unwrapOk(PdfVersion.create(a));
  const vb = unwrapOk(PdfVersion.create(b));
  expect(PdfVersion.compare(va, vb)).toBeGreaterThan(0);
});
