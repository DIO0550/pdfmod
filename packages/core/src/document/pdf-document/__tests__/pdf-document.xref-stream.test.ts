import { assert, expect, test } from "vitest";
import { PdfDocument } from "../../pdf-document";
import {
  buildPdfWithIncrementalUpdateViaXRefStream,
  buildPdfWithXRefStreamAndObjStm,
  buildSinglePagePdfWithXRefStream,
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
