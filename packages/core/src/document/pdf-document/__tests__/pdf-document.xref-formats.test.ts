import { assert, expect, test } from "vitest";
import { PdfDocument } from "../../pdf-document";
import {
  buildMinimalSinglePagePdfWithXRefStream,
  buildPdfWithEncryptDict,
  buildPdfWithHybridXRefStm,
  buildPdfWithWrongTypeXRefStream,
  buildPdfWithZeroStreamObjectXRefStream,
  buildXRefStreamPdfWithEncrypt,
  buildXRefStreamPdfWithEncryptAndTextTrailer,
  buildXRefStreamPdfWithoutEncrypt,
  withLeadingJunk,
} from "./pdf-document.test.helpers";

test("xrefストリーム形式のみのPDFはfallback scanを経由せず（XREF_REBUILD warningなしで）loadされる", async () => {
  const seen: string[] = [];
  const result = await PdfDocument.load(
    await buildMinimalSinglePagePdfWithXRefStream(),
    { onWarning: (w) => seen.push(w.code) },
  );

  assert(result.ok);
  expect(seen).not.toContain("XREF_REBUILD");
});

test("ハイブリッド参照(/XRefStm)PDFはfallback scanを経由せず（XREF_REBUILD warningなしで）loadされる", async () => {
  const seen: string[] = [];
  const result = await PdfDocument.load(await buildPdfWithHybridXRefStm(), {
    onWarning: (w) => seen.push(w.code),
  });

  assert(result.ok);
  expect(seen).not.toContain("XREF_REBUILD");
});

test("ハイブリッド参照(/XRefStm)PDFはObjStm内の/InfoオブジェクトをmetadataとしてTitleに反映する", async () => {
  const result = await PdfDocument.load(await buildPdfWithHybridXRefStm());

  assert(result.ok);
  expect(result.value.metadata.title).toBe("Hybrid Test");
});

test("ハイブリッド参照(/XRefStm)PDFはテキストxrefのCatalog/Pages/Page構造も正しく解決する", async () => {
  const result = await PdfDocument.load(await buildPdfWithHybridXRefStm());

  assert(result.ok);
  expect(result.value.pageCount).toBe(1);
  const page = result.value.getPage(0);
  assert(page.some);
  expect(page.value.mediaBox).toEqual([0, 0, 612, 792]);
});

test("trailerに/Encryptを持つPDFをloadするとENCRYPTED_PDF_UNSUPPORTEDを返す", async () => {
  const result = await PdfDocument.load(buildPdfWithEncryptDict());

  expect(result.ok).toBe(false);
  assert(!result.ok);
  assert(!(result.error instanceof RangeError));
  expect(result.error.code).toBe("ENCRYPTED_PDF_UNSUPPORTED");
});

test("xrefストリーム辞書に/Encryptを持つPDFはfallback scan経由でもENCRYPTED_PDF_UNSUPPORTEDを返す", async () => {
  const seen: string[] = [];
  const result = await PdfDocument.load(buildXRefStreamPdfWithEncrypt(), {
    onWarning: (w) => seen.push(w.code),
  });

  expect(seen).toContain("XREF_REBUILD");
  assert(!result.ok);
  assert(!(result.error instanceof RangeError));
  expect(result.error.code).toBe("ENCRYPTED_PDF_UNSUPPORTED");
});

test("/Encryptを持たないテキストtrailerが併存していてもxrefストリーム辞書の/EncryptでENCRYPTED_PDF_UNSUPPORTEDを返す", async () => {
  const seen: string[] = [];
  const result = await PdfDocument.load(
    buildXRefStreamPdfWithEncryptAndTextTrailer(),
    { onWarning: (w) => seen.push(w.code) },
  );

  expect(seen).toContain("XREF_REBUILD");
  assert(!result.ok);
  assert(!(result.error instanceof RangeError));
  expect(result.error.code).toBe("ENCRYPTED_PDF_UNSUPPORTED");
});

test("/Encryptを持たない解析不能なxrefストリームのPDFはfallback scan経由でXREF_REBUILD warningを伴ってOkになる", async () => {
  const seen: string[] = [];
  const result = await PdfDocument.load(buildXRefStreamPdfWithoutEncrypt(), {
    onWarning: (w) => seen.push(w.code),
  });

  assert(result.ok);
  expect(seen).toContain("XREF_REBUILD");
});

test("/TypeがXRefでないストリームがxrefストリーム位置にあるPDFはXREF_STREAM_INVALIDでfallback scanへ移行しXREF_REBUILD warningを伴ってOkになる", async () => {
  const seen: string[] = [];
  const result = await PdfDocument.load(
    await buildPdfWithWrongTypeXRefStream(),
    {
      onWarning: (w) => seen.push(w.code),
    },
  );

  assert(result.ok);
  expect(seen).toContain("XREF_REBUILD");
});

// #334: xref ストリームの type=2 エントリの親 ObjStm 番号が 0 だと
// XREF_STREAM_INVALID になるが、全走査フォールバックへ落ちて load は継続する。
test("type=2 の streamObject が 0 の xref ストリームPDFはfallback scan経由でXREF_REBUILD warningを伴ってOkになる", async () => {
  const seen: string[] = [];
  const result = await PdfDocument.load(
    await buildPdfWithZeroStreamObjectXRefStream(),
    { onWarning: (w) => seen.push(w.code) },
  );

  assert(result.ok);
  expect(seen).toContain("XREF_REBUILD");
});

test("前置ゴミが付加されたxrefストリーム形式のPDFを読み込み、ページを取得できること", async () => {
  const pdf = await buildMinimalSinglePagePdfWithXRefStream();
  const withJunk = withLeadingJunk(100, pdf);
  const result = await PdfDocument.load(withJunk);

  assert(result.ok);
  expect(result.value.pageCount).toBe(1);
  const page = result.value.getPage(0);
  assert(page.some);
  expect(page.value.mediaBox).toEqual([0, 0, 612, 792]);
});

test("前置ゴミ（複数行テキスト）が付加されたxrefストリーム形式のPDFが正常に読み込めること", async () => {
  const multilineJunk = new TextEncoder().encode(
    "header junk line 1\nline 2\n",
  );
  const pdf = await buildMinimalSinglePagePdfWithXRefStream();
  const withJunk = withLeadingJunk(multilineJunk, pdf);
  const result = await PdfDocument.load(withJunk);

  assert(result.ok);
  expect(result.value.pageCount).toBe(1);
});

test("前置ゴミが付加されたハイブリッド参照（/XRefStm）PDFが通常パース経路（警告なし）で読み込めること", async () => {
  const seen: string[] = [];
  const pdf = await buildPdfWithHybridXRefStm();
  const withJunk = withLeadingJunk(80, pdf);
  const result = await PdfDocument.load(withJunk, {
    onWarning: (w) => seen.push(w.code),
  });

  assert(result.ok);
  expect(seen).not.toContain("XREF_REBUILD");
  expect(result.value.metadata.title).toBe("Hybrid Test");
  expect(result.value.pageCount).toBe(1);
  const page = result.value.getPage(0);
  assert(page.some);
  expect(page.value.mediaBox).toEqual([0, 0, 612, 792]);
});
