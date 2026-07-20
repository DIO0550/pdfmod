import { assert, expect, test } from "vitest";
import type { PdfWarning } from "../../../pdf/errors/warning/index";
import { PdfDocument } from "../../pdf-document";
import {
  buildHybridReferencePdfWithXRefStm,
  buildPdfWithIncrementalUpdateViaXRefStream,
  buildPdfWithUnresolvableXRefStreamIndirectLength,
  buildPdfWithXRefStreamAndObjStm,
  buildSinglePagePdfWithXRefStream,
  buildSinglePagePdfWithXRefStreamIndirectLength,
} from "./pdf-document.xref-stream.test.helpers";

test("xrefストリームのみを持つPDFをloadでき、ページが解決される", async () => {
  const result = await PdfDocument.load(buildSinglePagePdfWithXRefStream());

  assert(result.ok);
  expect(result.value.pageCount).toBe(1);
  const page = result.value.getPage(0);
  assert(page.some);
  expect(page.value.mediaBox).toEqual([0, 0, 612, 792]);
});

test("テキストxref(旧)とxrefストリーム(新)の/Prevチェーンを辿り最新Rootのページ構造を観測する", async () => {
  const result = await PdfDocument.load(
    buildPdfWithIncrementalUpdateViaXRefStream(),
  );

  assert(result.ok);
  expect(result.value.pageCount).toBe(1);
  const page = result.value.getPage(0);
  assert(page.some);
  expect(page.value.mediaBox).toEqual([0, 0, 200, 300]);
});

test("xrefストリームのtype=2エントリ経由でObjStm内のCatalog/Pages/Pageが解決される", async () => {
  const result = await PdfDocument.load(buildPdfWithXRefStreamAndObjStm());

  assert(result.ok);
  expect(result.value.pageCount).toBe(1);
  const page = result.value.getPage(0);
  assert(page.some);
  expect(page.value.mediaBox).toEqual([0, 0, 612, 792]);
});

test("ハイブリッド参照ファイル(/XRefStm)経由でObjStm内のみに存在するPageが解決される", async () => {
  const result = await PdfDocument.load(buildHybridReferencePdfWithXRefStm());

  assert(result.ok);
  expect(result.value.pageCount).toBe(1);
  const page = result.value.getPage(0);
  assert(page.some);
  expect(page.value.mediaBox).toEqual([0, 0, 612, 792]);
});

test("xrefストリーム自身の間接/Lengthを解決してloadでき、ページが解決される（UC-1、Issue #549）", async () => {
  const result = await PdfDocument.load(
    buildSinglePagePdfWithXRefStreamIndirectLength(),
  );

  assert(result.ok);
  expect(result.value.pageCount).toBe(1);
  const page = result.value.getPage(0);
  assert(page.some);
  expect(page.value.mediaBox).toEqual([0, 0, 612, 792]);
});

test("間接/Length解決に失敗してもscanFallbackで復旧しOkを返す（UC-2a、Issue #549）", async () => {
  const seen: PdfWarning[] = [];
  const result = await PdfDocument.load(
    buildPdfWithUnresolvableXRefStreamIndirectLength(),
    { onWarning: (w) => seen.push(w) },
  );

  assert(result.ok);
  expect(result.value.pageCount).toBe(1);
  const codes = seen.map((w) => w.code);
  expect(codes).toContain("XREF_REBUILD");
  expect(codes).not.toContain("XREF_STREAM_LENGTH_BOOTSTRAP");
});

test("間接/Length解決に失敗しscanFallbackでも復旧できない場合はErrを返す（UC-2b、Issue #549）", async () => {
  const result = await PdfDocument.load(
    buildPdfWithUnresolvableXRefStreamIndirectLength({
      includeCatalogTypeHint: false,
    }),
  );

  assert(!result.ok);
  assert(!(result.error instanceof RangeError));
  expect(result.error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("補助ストリーム自体に/Rootが無いハイブリッド参照ファイルでもObjStm内のPageが解決される", async () => {
  const result = await PdfDocument.load(
    buildHybridReferencePdfWithXRefStm({ includeRootInStream: false }),
  );

  assert(result.ok);
  expect(result.value.pageCount).toBe(1);
  const page = result.value.getPage(0);
  assert(page.some);
  expect(page.value.mediaBox).toEqual([0, 0, 612, 792]);
});
