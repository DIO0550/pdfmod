import { expect, test } from "vitest";
import type { Result } from "../../utils/result/index";
import { PdfVersion } from "./index";

const unwrapOk = <T>(result: Result<T, unknown>): T => {
  expect(result.ok).toBe(true);
  return (result as { ok: true; value: T }).value;
};

test.each([
  "1.0",
  "1.1",
  "1.2",
  "1.3",
  "1.4",
  "1.5",
  "1.6",
  "1.7",
  "2.0",
])("PdfVersion.create returns Ok for supported version %s", (s) => {
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
])("PdfVersion.create returns Err for malformed string %s", (s) => {
  const result = PdfVersion.create(s);
  expect(result.ok).toBe(false);
});

test.each([
  "0.0",
  "1.8",
  "1.10",
  "2.1",
  "3.0",
  "10.20",
])("PdfVersion.create returns Err for unsupported version %s", (s) => {
  const result = PdfVersion.create(s);
  expect(result.ok).toBe(false);
});

test.each([
  ["1.7", "1.7"],
  ["1.0", "1.0"],
  ["2.0", "2.0"],
])("PdfVersion.compare(%s, %s) returns 0 (equal)", (a, b) => {
  const va = unwrapOk(PdfVersion.create(a));
  const vb = unwrapOk(PdfVersion.create(b));
  expect(PdfVersion.compare(va, vb)).toBe(0);
});

test.each([
  ["1.5", "1.7"],
  ["1.0", "1.7"],
  ["1.7", "2.0"],
  ["1.0", "2.0"],
])("PdfVersion.compare(%s, %s) returns negative (a < b)", (a, b) => {
  const va = unwrapOk(PdfVersion.create(a));
  const vb = unwrapOk(PdfVersion.create(b));
  expect(PdfVersion.compare(va, vb)).toBeLessThan(0);
});

test.each([
  ["1.7", "1.5"],
  ["1.7", "1.0"],
  ["2.0", "1.7"],
  ["2.0", "1.0"],
])("PdfVersion.compare(%s, %s) returns positive (a > b)", (a, b) => {
  const va = unwrapOk(PdfVersion.create(a));
  const vb = unwrapOk(PdfVersion.create(b));
  expect(PdfVersion.compare(va, vb)).toBeGreaterThan(0);
});
