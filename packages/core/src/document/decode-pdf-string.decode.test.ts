import { expect, test } from "vitest";
import type { PdfWarning } from "../pdf/errors/warning/index";
import type { PdfString } from "../pdf/types/pdf-types/index";
import { decodePdfString } from "./decode-pdf-string";
import { REPLACEMENT_CHAR } from "./pdf-doc-encoding";

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

test("BOM + 単独 high surrogate (D8 3D + 通常文字) は undefined + STRING_DECODE_FAILED", () => {
  const warnings: PdfWarning[] = [];
  // 0xFE 0xFF + 0xD8 0x3D 0x00 0x41 (high surrogate の後に通常の A が続く = 不正)
  const bytes = new Uint8Array([0xfe, 0xff, 0xd8, 0x3d, 0x00, 0x41]);
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toBeUndefined();
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("STRING_DECODE_FAILED");
});

test("BOM + 単独 low surrogate (DE 80 単独) は undefined + STRING_DECODE_FAILED", () => {
  const warnings: PdfWarning[] = [];
  const bytes = new Uint8Array([0xfe, 0xff, 0xde, 0x80]);
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toBeUndefined();
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("STRING_DECODE_FAILED");
});

test("BOM なしバイト列 (ASCII) は decodePdfDocEncoding に委譲される", () => {
  const warnings: PdfWarning[] = [];
  // ASCII "Hello"
  const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toBe("Hello");
  expect(warnings).toHaveLength(0);
});

test("BOM なし + PDFDocEncoding 未割当バイトは U+FFFD 置換 + 警告 1 件", () => {
  const warnings: PdfWarning[] = [];
  const bytes = new Uint8Array([0x9f, 0x41]); // 0x9F 未割当 + "A"
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toBe(`${REPLACEMENT_CHAR}A`);
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("STRING_DECODE_FAILED");
});
