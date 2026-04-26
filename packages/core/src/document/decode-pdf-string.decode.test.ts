import { expect, test } from "vitest";
import type { PdfWarning } from "../pdf/errors/warning/index";
import type { PdfString } from "../pdf/types/pdf-types/index";
import { decodePdfString } from "./decode-pdf-string";

const pdfString = (bytes: Uint8Array): PdfString => ({
  type: "string",
  value: bytes,
  encoding: "literal",
});

test("空バイト列は空文字列を返し警告を出さない", () => {
  const warnings: PdfWarning[] = [];
  const result = decodePdfString(
    pdfString(new Uint8Array([])),
    "Title",
    warnings,
  );
  expect(result).toBe("");
  expect(warnings).toHaveLength(0);
});

test("BOM 単独 (0xFE 0xFF のみ) は空文字列を返し警告を出さない", () => {
  const warnings: PdfWarning[] = [];
  const result = decodePdfString(
    pdfString(new Uint8Array([0xfe, 0xff])),
    "Title",
    warnings,
  );
  expect(result).toBe("");
  expect(warnings).toHaveLength(0);
});

test("BOM + UTF-16BE バイト列が日本語文字列にデコードされる", () => {
  const warnings: PdfWarning[] = [];
  // "日本" = U+65E5 U+672C → BE bytes: 65 E5 67 2C
  const bytes = new Uint8Array([0xfe, 0xff, 0x65, 0xe5, 0x67, 0x2c]);
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toBe("日本");
  expect(warnings).toHaveLength(0);
});
