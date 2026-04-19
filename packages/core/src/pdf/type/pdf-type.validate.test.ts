import { assert, expect, test } from "vitest";
import type { PdfValue } from "../types/pdf-types/index";
import { PdfType } from "./index";

test("期待する名前の /Type がある場合 none を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Type", { type: "name", value: "ObjStm" }],
  ]);
  const result = PdfType.validate(entries, "ObjStm");
  expect(result.some).toBe(false);
});

test("/Type がない場合 some(PDF_TYPE_INVALID) を返す", () => {
  const entries = new Map<string, PdfValue>();
  const result = PdfType.validate(entries, "ObjStm");
  assert(result.some);
  expect(result.value.code).toBe("PDF_TYPE_INVALID");
  expect(result.value.message).toContain("/Type");
});

test("/Type が name でない場合 some(PDF_TYPE_INVALID) を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Type", { type: "integer", value: 1 }],
  ]);
  const result = PdfType.validate(entries, "ObjStm");
  assert(result.some);
  expect(result.value.code).toBe("PDF_TYPE_INVALID");
});

test("/Type の値が期待と異なる場合 some(PDF_TYPE_INVALID) を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Type", { type: "name", value: "XRef" }],
  ]);
  const result = PdfType.validate(entries, "ObjStm");
  assert(result.some);
  expect(result.value.code).toBe("PDF_TYPE_INVALID");
  expect(result.value.message).toContain("/XRef");
});
