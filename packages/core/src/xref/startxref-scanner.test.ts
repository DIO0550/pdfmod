import { test, expect } from "vitest";
import { scanStartXRef } from "./startxref-scanner.js";

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// --- 正常系 ---

test("正常なPDF末尾構造からstartxrefオフセットを取得する", () => {
  const data = encode("dummy body\nstartxref\n12345\n%%EOF\n");
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 12345 });
});

test("CR+LF改行のPDF末尾構造を処理する", () => {
  const data = encode("dummy body\r\nstartxref\r\n12345\r\n%%EOF\r\n");
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 12345 });
});

test("CR改行のPDF末尾構造を処理する", () => {
  const data = encode("dummy body\rstartxref\r12345\r%%EOF\r");
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 12345 });
});

test("オフセット値0を正しく取得する", () => {
  const data = encode("startxref\n0\n%%EOF\n");
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 0 });
});

test("末尾に余分なバイトがあるPDFを処理する", () => {
  const data = encode("dummy\nstartxref\n999\n%%EOF\n\n\n");
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 999 });
});

test("1024バイト未満の小さいPDFを処理する", () => {
  const data = encode("startxref\n42\n%%EOF\n");
  expect(data.length).toBeLessThan(1024);
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 42 });
});

// --- 異常系 ---

test("%%EOFが見つからない場合にエラーを返す", () => {
  const data = encode("no eof marker here");
  expect(scanStartXRef(data)).toEqual({
    ok: false,
    error: expect.objectContaining({
      code: "STARTXREF_NOT_FOUND",
      message: expect.stringContaining("%%EOF"),
    }),
  });
});

test("startxrefが見つからない場合にエラーを返す", () => {
  const data = encode("some data\n%%EOF\n");
  expect(scanStartXRef(data)).toEqual({
    ok: false,
    error: expect.objectContaining({
      code: "STARTXREF_NOT_FOUND",
      message: expect.stringContaining("startxref"),
    }),
  });
});

test("startxref後に数字がない場合にエラーを返す", () => {
  const data = encode("startxref\nabc\n%%EOF\n");
  expect(scanStartXRef(data)).toEqual({
    ok: false,
    error: expect.objectContaining({ code: "STARTXREF_NOT_FOUND" }),
  });
});

test("空のUint8Arrayに対してエラーを返す", () => {
  const data = new Uint8Array(0);
  expect(scanStartXRef(data)).toEqual({
    ok: false,
    error: expect.objectContaining({ code: "STARTXREF_NOT_FOUND" }),
  });
});

test("startxref後のオフセット値が%%EOFの後にある場合にエラーを返す", () => {
  const data = encode("startxref\n%%EOF\n123");
  expect(scanStartXRef(data)).toEqual({
    ok: false,
    error: expect.objectContaining({ code: "STARTXREF_NOT_FOUND" }),
  });
});

test("直近のstartxrefが不正な場合に前方の有効な候補を使わずエラーを返す", () => {
  // 最後の%%EOFに最も近いstartxrefのオフセットが壊れている場合、
  // より前方の古いstartxrefにフォールバックせずエラーにする
  const data = encode(
    "startxref\n100\n%%EOF\nstartxref\nabc\n%%EOF\n",
  );
  expect(scanStartXRef(data)).toEqual({
    ok: false,
    error: expect.objectContaining({ code: "STARTXREF_NOT_FOUND" }),
  });
});

// --- 境界値 ---

test("%%EOFが1024バイト境界ちょうどにある場合を処理する", () => {
  const eofAndTrailer = "\nstartxref\n500\n%%EOF\n";
  const paddingLength = 1024 - eofAndTrailer.length;
  const padding = "x".repeat(paddingLength);
  const data = encode(padding + eofAndTrailer);
  expect(data.length).toBe(1024);
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 500 });
});

test("%%EOFが1024バイト境界の外にある場合にエラーを返す", () => {
  const eofAndTrailer = "startxref\n500\n%%EOF\n";
  const trailingBytes = "z".repeat(1024);
  const data = encode(eofAndTrailer + trailingBytes);
  expect(scanStartXRef(data)).toEqual({
    ok: false,
    error: expect.objectContaining({ code: "STARTXREF_NOT_FOUND" }),
  });
});

test("%%EOFが複数ある場合に最後のものを使用する", () => {
  const data = encode(
    "startxref\n100\n%%EOF\n" + "startxref\n200\n%%EOF\n",
  );
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 200 });
});

test("無効なstartxref候補を飛ばして有効な候補を見つける", () => {
  // "xstartxref" has no whitespace boundary before it, so it's invalid
  const data = encode(
    "startxref\n300\nxstartxref\nabc\n%%EOF\n",
  );
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 300 });
});

test("startxref後にコメントがある場合を処理する", () => {
  const data = encode("startxref%comment\n123\n%%EOF\n");
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 123 });
});

// --- fixture ---

test("実際のPDFファイルからstartxrefを取得する", () => {
  const body =
    "%PDF-1.4\n" +
    "1 0 obj\n" +
    "<< /Type /Catalog /Pages 2 0 R >>\n" +
    "endobj\n" +
    "2 0 obj\n" +
    "<< /Type /Pages /Kids [] /Count 0 >>\n" +
    "endobj\n";
  const xrefOffset = body.length; // 110
  const pdf =
    body +
    "xref\n" +
    "0 3\n" +
    "0000000000 65535 f \r\n" +
    "0000000009 00000 n \r\n" +
    "0000000058 00000 n \r\n" +
    "trailer\n" +
    "<< /Size 3 /Root 1 0 R >>\n" +
    "startxref\n" +
    xrefOffset +
    "\n" +
    "%%EOF\n";
  const pdfData = encode(pdf);
  const result = scanStartXRef(pdfData);
  expect(result).toEqual({ ok: true, value: xrefOffset });
});
