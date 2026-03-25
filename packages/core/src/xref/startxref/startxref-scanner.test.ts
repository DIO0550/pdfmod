import { expect, test } from "vitest";
import { scanStartXRef } from "./startxref-scanner";

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// --- 正常系 ---

test("正常なPDF末尾構造からstartxrefオフセットを取得する", () => {
  const data = encode("dummy body\nstartxref\n9\n%%EOF\n");
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 9 });
});

test("CR+LF改行のPDF末尾構造を処理する", () => {
  const data = encode("dummy body\r\nstartxref\r\n9\r\n%%EOF\r\n");
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 9 });
});

test("CR改行のPDF末尾構造を処理する", () => {
  const data = encode("dummy body\rstartxref\r9\r%%EOF\r");
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 9 });
});

test("オフセット値0を正しく取得する", () => {
  const data = encode("dummy body\nstartxref\n0\n%%EOF\n");
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 0 });
});

test("末尾に余分なバイトがあるPDFを処理する", () => {
  const data = encode("dummy\nstartxref\n5\n%%EOF\n\n\n");
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 5 });
});

test("1024バイト未満の小さいPDFを処理する", () => {
  const data = encode("dummy body\nstartxref\n3\n%%EOF\n");
  expect(data.length).toBeLessThan(1024);
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 3 });
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
  const data = encode("startxref\n0\n%%EOF\nstartxref\nabc\n%%EOF\n");
  expect(scanStartXRef(data)).toEqual({
    ok: false,
    error: expect.objectContaining({ code: "STARTXREF_NOT_FOUND" }),
  });
});

test("オフセット値がファイル長以上の場合にエラーを返す", () => {
  const data = encode("startxref\n99999\n%%EOF\n");
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

test("startxrefがtailStartより前にある場合でも検出する", () => {
  // startxref + %%EOF の後に大量のtrailing garbageがあり、
  // %%EOFは末尾1024バイト内だがstartxrefはtailStartより前にある構造
  const pdfPart = "dummy body\nstartxref\n0\n%%EOF\n";
  const trailingLength = 1024 - 6; // %%EOF\nが末尾1024バイト境界内に残る程度
  const trailing = " ".repeat(trailingLength);
  const data = encode(pdfPart + trailing);
  expect(data.length).toBeGreaterThan(1024);
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 0 });
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
    "startxref\n0\n%%EOF\n" + "dummy body dummy body\nstartxref\n0\n%%EOF\n",
  );
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 0 });
});

test("前方にトークン境界のないstartxref候補をスキップする", () => {
  // "xstartxref" は前方が非境界文字なのでトークンとして認識されない
  const data = encode("xstartxref\n5\n%%EOF\n");
  expect(scanStartXRef(data)).toEqual({
    ok: false,
    error: expect.objectContaining({ code: "STARTXREF_NOT_FOUND" }),
  });
});

test("後方にトークン境界のないstartxref候補をスキップする", () => {
  // "startxrefX" は後方が非境界文字なのでトークンとして認識されない
  const data = encode("startxrefX\n5\n%%EOF\n");
  expect(scanStartXRef(data)).toEqual({
    ok: false,
    error: expect.objectContaining({ code: "STARTXREF_NOT_FOUND" }),
  });
});

test("数字列後に不正な文字が続く場合にエラーを返す", () => {
  const data = encode("startxref\n123abc\n%%EOF\n");
  expect(scanStartXRef(data)).toEqual({
    ok: false,
    error: expect.objectContaining({ code: "STARTXREF_NOT_FOUND" }),
  });
});

test("startxref後にコメントがある場合を処理する", () => {
  const data = encode("dummy body\nstartxref%comment\n5\n%%EOF\n");
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 5 });
});

test("コメント内のstartxrefを無視する", () => {
  // 行頭の % により "startxref" はコメント内なので無視されるべき
  const data = encode("%startxref\n5\n%%EOF\n");
  expect(scanStartXRef(data)).toEqual({
    ok: false,
    error: expect.objectContaining({ code: "STARTXREF_NOT_FOUND" }),
  });
});

test("コメント本文中の%%EOFを無視する", () => {
  // コメント行内の %%EOF はEOFマーカーとして扱わない
  const data = encode("dummy body\nstartxref\n5\n%fake %%EOF here\n%%EOF\n");
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 5 });
});

// --- fixture ---

// --- 追加エッジケース ---

test("非境界 x%%EOF はEOFマーカーとして誤認しない", () => {
  const data = encode("startxref\n5\nx%%EOF\n");
  expect(scanStartXRef(data)).toEqual({
    ok: false,
    error: expect.objectContaining({ code: "STARTXREF_NOT_FOUND" }),
  });
});

test("非境界 %%EOFx はEOFマーカーとして誤認しない", () => {
  // %%EOF 後に非境界文字が続く場合、EOFマーカーとして扱わない
  const data = encode("dummy\nstartxref\n5\n%%EOFx\n");
  expect(scanStartXRef(data)).toEqual({
    ok: false,
    error: expect.objectContaining({ code: "STARTXREF_NOT_FOUND" }),
  });
});

test("ファイル末尾がちょうど%%EOFで終わる (改行なし)", () => {
  const data = encode("dummy\nstartxref\n5\n%%EOF");
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 5 });
});

test("数値後コメントがある場合を処理する", () => {
  const data = encode("dummy\nstartxref\n5 %comment\n%%EOF\n");
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 5 });
});

test("TABをstartxrefと数値の間に挟むケースを処理する", () => {
  const data = encode("dummy\nstartxref\t5\n%%EOF\n");
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 5 });
});

test("FFをstartxrefと数値の間に挟むケースを処理する", () => {
  const data = new Uint8Array([
    ...encode("dummy\nstartxref"),
    0x0c,
    ...encode("5\n%%EOF\n"),
  ]);
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 5 });
});

test("NULをstartxrefと数値の間に挟むケースを処理する", () => {
  const data = new Uint8Array([
    ...encode("dummy\nstartxref"),
    0x00,
    ...encode("5\n%%EOF\n"),
  ]);
  const result = scanStartXRef(data);
  expect(result).toEqual({ ok: true, value: 5 });
});

test("巨大オフセット (Number.MAX_SAFE_INTEGER超) はエラーを返す", () => {
  const hugeOffset = "99999999999999999";
  const data = encode(`${"x".repeat(100)}\nstartxref\n${hugeOffset}\n%%EOF\n`);
  expect(scanStartXRef(data)).toEqual({
    ok: false,
    error: expect.objectContaining({ code: "STARTXREF_NOT_FOUND" }),
  });
});

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
