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

test("BOM + UTF-16BE のサロゲートペア（🚀 = U+1F680）が正しくデコードされる", () => {
  const warnings: PdfWarning[] = [];
  // 🚀 = U+1F680 → UTF-16: D83D DE80 → BE bytes: D8 3D DE 80
  const bytes = new Uint8Array([0xfe, 0xff, 0xd8, 0x3d, 0xde, 0x80]);
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toBe("🚀");
  expect(warnings).toHaveLength(0);
});

test("BOM + 奇数長バイト列は undefined + STRING_DECODE_FAILED", () => {
  const warnings: PdfWarning[] = [];
  // 0xFE 0xFF + [0x00, 0x41, 0x00] (3 バイト = 奇数)
  const bytes = new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x00]);
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toBeUndefined();
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("STRING_DECODE_FAILED");
  expect(warnings[0].message).toContain("Title");
});
