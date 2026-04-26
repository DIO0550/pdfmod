import { expect, test } from "vitest";
import { PdfTrapped } from "./document-metadata";

test.each([
  ["True"],
  ["False"],
  ["Unknown"],
])("PdfTrapped.create returns Ok for %s", (s) => {
  const result = PdfTrapped.create(s);
  expect(result).toStrictEqual({ ok: true, value: s });
});

test.each([
  ["Yes"],
  ["true"],
  ["false"],
  ["unknown"],
  [""],
])("PdfTrapped.create returns Err for %s", (s) => {
  const result = PdfTrapped.create(s);
  expect(result.ok).toBe(false);
});

test("PdfTrapped.create Err message lists supported values", () => {
  const result = PdfTrapped.create("Yes");
  expect(result).toStrictEqual({
    ok: false,
    error: 'Invalid PdfTrapped: "Yes" (supported: True, False, Unknown)',
  });
});
