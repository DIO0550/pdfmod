import { assert, expect, test } from "vitest";
import { PdfDocument } from "../../pdf-document";
import {
  buildMinimalSinglePagePdfWithXRefStream,
  buildPdfWithEncryptDict,
  buildPdfWithHybridXRefStm,
  buildPdfWithXRefStreamDecodeParms,
} from "./pdf-document.test.helpers";

test("xrefストリーム形式のみのPDFをloadするとpageCount=1を返す", async () => {
  const result = await PdfDocument.load(
    await buildMinimalSinglePagePdfWithXRefStream(),
  );

  assert(result.ok);
  expect(result.value.pageCount).toBe(1);
});

test("xrefストリーム形式のみのPDFのgetPage(0)は正しいMediaBoxを返す", async () => {
  const result = await PdfDocument.load(
    await buildMinimalSinglePagePdfWithXRefStream(),
  );

  assert(result.ok);
  const page = result.value.getPage(0);
  assert(page.some);
  expect(page.value.mediaBox).toEqual([0, 0, 612, 792]);
});

test("xrefストリーム形式のみのPDFはfallback scanを経由せず（XREF_REBUILD warningなしで）loadされる", async () => {
  const seen: string[] = [];
  const result = await PdfDocument.load(
    await buildMinimalSinglePagePdfWithXRefStream(),
    { onWarning: (w) => seen.push(w.code) },
  );

  assert(result.ok);
  expect(seen).not.toContain("XREF_REBUILD");
});

test("ハイブリッド参照(/XRefStm)PDFをloadするとOkを返す", async () => {
  const result = await PdfDocument.load(await buildPdfWithHybridXRefStm());

  assert(result.ok);
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

test("/DecodeParmsを持つxrefストリームのPDFはXREF_STREAM_INVALIDでfallback scanへ移行しXREF_REBUILD warningを伴ってOkになる", async () => {
  const seen: string[] = [];
  const result = await PdfDocument.load(
    await buildPdfWithXRefStreamDecodeParms(),
    { onWarning: (w) => seen.push(w.code) },
  );

  assert(result.ok);
  expect(seen).toContain("XREF_REBUILD");
});
