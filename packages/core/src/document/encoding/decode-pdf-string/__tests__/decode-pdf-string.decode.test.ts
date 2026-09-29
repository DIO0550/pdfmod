import { expect, test } from "vitest";
import type { PdfWarning } from "../../../../pdf/errors/warning/index";
import type { PdfString } from "../../../../pdf/types/pdf-types/index";
import { none, some } from "../../../../utils/option";
import { decodePdfString } from "../../decode-pdf-string";
import { REPLACEMENT_CHAR } from "../../pdf-doc-encoding";

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
  expect(result).toEqual(some(""));
  expect(warnings).toHaveLength(0);
});

test("UTF-8 BOM 単独は空文字列を返し警告を出さない", () => {
  const warnings: PdfWarning[] = [];
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf]);
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toEqual(some(""));
  expect(warnings).toHaveLength(0);
});

test("UTF-8 BOM 付きの日本語と補助平面文字を復号する", () => {
  const warnings: PdfWarning[] = [];
  const bytes = new Uint8Array([
    0xef, 0xbb, 0xbf, 0xe6, 0x97, 0xa5, 0xf0, 0x9f, 0x9a, 0x80,
  ]);
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toEqual(some("日🚀"));
  expect(warnings).toHaveLength(0);
});

test("UTF-8 BOM の直後の U+FEFF は本文に残る", () => {
  const warnings: PdfWarning[] = [];
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf, 0x41]);
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toEqual(some("\uFEFFA"));
  expect(warnings).toHaveLength(0);
});

test("UTF-8 BOM の後が不正な符号化なら値を採用しない", () => {
  const warnings: PdfWarning[] = [];
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0xc3, 0x28]);
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toEqual(none);
  expect(warnings).toEqual([
    { code: "STRING_DECODE_FAILED", message: "UTF-8 decode failed for /Title" },
  ]);
});

test("UTF-8 BOM の後でマルチバイト列が途切れた場合は警告する", () => {
  const warnings: PdfWarning[] = [];
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0xe3, 0x81]);
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toEqual(none);
  expect(warnings).toEqual([
    { code: "STRING_DECODE_FAILED", message: "UTF-8 decode failed for /Title" },
  ]);
});

test("不完全な UTF-8 BOM 接頭辞は PDFDocEncoding で復号する", () => {
  const warnings: PdfWarning[] = [];
  const bytes = new Uint8Array([0xef, 0xbb]);
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toEqual(some("ï»"));
  expect(warnings).toHaveLength(0);
});

test("長い UTF-8 BOM 付き文字列を最後まで復号する", () => {
  const warnings: PdfWarning[] = [];
  const encodedDay = new Uint8Array([0xe6, 0x97, 0xa5]);
  const bytes = new Uint8Array(3 + encodedDay.length * 4096);
  bytes.set([0xef, 0xbb, 0xbf]);
  for (let index = 0; index < 4096; index++) {
    bytes.set(encodedDay, 3 + index * encodedDay.length);
  }
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toEqual(some("日".repeat(4096)));
  expect(warnings).toHaveLength(0);
});

test("BOM 単独 (0xFE 0xFF のみ) は空文字列を返し警告を出さない", () => {
  const warnings: PdfWarning[] = [];
  const result = decodePdfString(
    pdfString(new Uint8Array([0xfe, 0xff])),
    "Title",
    warnings,
  );
  expect(result).toEqual(some(""));
  expect(warnings).toHaveLength(0);
});

test("BOM + UTF-16BE バイト列が日本語文字列にデコードされる", () => {
  const warnings: PdfWarning[] = [];
  // "日本" = U+65E5 U+672C → BE bytes: 65 E5 67 2C
  const bytes = new Uint8Array([0xfe, 0xff, 0x65, 0xe5, 0x67, 0x2c]);
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toEqual(some("日本"));
  expect(warnings).toHaveLength(0);
});

test("BOM + UTF-16BE のサロゲートペア（🚀 = U+1F680）が正しくデコードされる", () => {
  const warnings: PdfWarning[] = [];
  // 🚀 = U+1F680 → UTF-16: D83D DE80 → BE bytes: D8 3D DE 80
  const bytes = new Uint8Array([0xfe, 0xff, 0xd8, 0x3d, 0xde, 0x80]);
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toEqual(some("🚀"));
  expect(warnings).toHaveLength(0);
});

test("BOM + 奇数長バイト列は none + STRING_DECODE_FAILED", () => {
  const warnings: PdfWarning[] = [];
  // 0xFE 0xFF + [0x00, 0x41, 0x00] (3 バイト = 奇数)
  const bytes = new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x00]);
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toEqual(none);
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("STRING_DECODE_FAILED");
  expect(warnings[0].message).toContain("Title");
});

test("BOM + 単独 high surrogate (D8 3D + 通常文字) は none + STRING_DECODE_FAILED", () => {
  const warnings: PdfWarning[] = [];
  // 0xFE 0xFF + 0xD8 0x3D 0x00 0x41 (high surrogate の後に通常の A が続く = 不正)
  const bytes = new Uint8Array([0xfe, 0xff, 0xd8, 0x3d, 0x00, 0x41]);
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toEqual(none);
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("STRING_DECODE_FAILED");
});

test("BOM + 単独 low surrogate (DE 80 単独) は none + STRING_DECODE_FAILED", () => {
  const warnings: PdfWarning[] = [];
  const bytes = new Uint8Array([0xfe, 0xff, 0xde, 0x80]);
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toEqual(none);
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("STRING_DECODE_FAILED");
});

test("BOM なしバイト列 (ASCII) は decodePdfDocEncoding に委譲される", () => {
  const warnings: PdfWarning[] = [];
  // ASCII "Hello"
  const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toEqual(some("Hello"));
  expect(warnings).toHaveLength(0);
});

test("BOM なし + PDFDocEncoding 未割当バイトは U+FFFD 置換 + 警告 1 件", () => {
  const warnings: PdfWarning[] = [];
  const bytes = new Uint8Array([0x9f, 0x41]); // 0x9F 未割当 + "A"
  const result = decodePdfString(pdfString(bytes), "Title", warnings);
  expect(result).toEqual(some(`${REPLACEMENT_CHAR}A`));
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("STRING_DECODE_FAILED");
});
