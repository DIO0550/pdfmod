import { assert, expect, test } from "vitest";
import { GenerationNumber } from "../../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../../pdf/types/object-number/index";
import { PdfDocument } from "../../pdf-document";
import {
  buildMinimalSinglePagePdf,
  buildPdfWithIncrementalUpdate,
  buildSinglePagePdfWithInfo,
  buildTwoPagePdf,
  withLeadingJunk,
} from "./pdf-document.test.helpers";

test("最小 1-page PDF を load すると pageCount=1 を返す", async () => {
  const result = await PdfDocument.load(buildMinimalSinglePagePdf());

  assert(result.ok);
  expect(result.value.pageCount).toBe(1);
});

test("最小 1-page PDF を load するとヘッダ由来の version='1.7' を返す", async () => {
  const result = await PdfDocument.load(buildMinimalSinglePagePdf());

  assert(result.ok);
  expect(result.value.version).toBe("1.7");
});

test("最小 1-page PDF の getPage(0) は Some(ResolvedPage) を返す", async () => {
  const result = await PdfDocument.load(buildMinimalSinglePagePdf());

  assert(result.ok);
  const page = result.value.getPage(0);
  assert(page.some);
  expect(page.value.mediaBox).toEqual([0, 0, 612, 792]);
});

test("2-page PDF を load すると pageCount=2 を返す", async () => {
  const result = await PdfDocument.load(buildTwoPagePdf());

  assert(result.ok);
  expect(result.value.pageCount).toBe(2);
});

test.each([
  { label: "title のみ", info: { title: "Hello" } },
  { label: "author のみ", info: { author: "Alice" } },
  {
    label: "title + author",
    info: { title: "MyTitle", author: "Bob" },
  },
])("/Info 付き PDF ($label) を load すると metadata に値が抽出される", async ({
  info,
}) => {
  const result = await PdfDocument.load(buildSinglePagePdfWithInfo(info));

  assert(result.ok);
  expect(result.value.metadata.title).toBe(info.title);
  expect(result.value.metadata.author).toBe(info.author);
});

test("incremental update PDF を load すると Ok を返す", async () => {
  const result = await PdfDocument.load(buildPdfWithIncrementalUpdate());

  assert(result.ok);
});

test("incremental update PDF の load 結果は最新 trailer の /Root 経由で page 構造を観測できる", async () => {
  const result = await PdfDocument.load(buildPdfWithIncrementalUpdate());

  assert(result.ok);
  expect(result.value.pageCount).toBe(1);
  const page = result.value.getPage(0);
  assert(page.some);
  expect(page.value.mediaBox).toEqual([0, 0, 200, 300]);
});

test("incremental update PDF の resolver は旧 xref のみに残る object も解決できる", async () => {
  const result = await PdfDocument.load(buildPdfWithIncrementalUpdate());

  assert(result.ok);
  const oldCatalog = await result.value.resolver.get({
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
  });
  assert(oldCatalog.ok);
  expect(oldCatalog.value.type).toBe("dictionary");
});

test("前置ゴミ（100バイト）が付加された通常xref PDFを読み込み、1ページ取得できること", async () => {
  const pdf = buildMinimalSinglePagePdf();
  const withJunk = withLeadingJunk(100, pdf);
  const result = await PdfDocument.load(withJunk);

  assert(result.ok);
  expect(result.value.pageCount).toBe(1);
  const page = result.value.getPage(0);
  assert(page.some);
  expect(page.value.mediaBox).toEqual([0, 0, 612, 792]);
});

test("前置ゴミが付加された通常xref PDFの読み込みで不要な XREF_REBUILD 警告が発行されないこと", async () => {
  const pdf = buildMinimalSinglePagePdf();
  const withJunk = withLeadingJunk(100, pdf);
  const warnings: string[] = [];
  const result = await PdfDocument.load(withJunk, {
    onWarning: (w) => warnings.push(w.code),
  });

  assert(result.ok);
  expect(warnings).not.toContain("XREF_REBUILD");
});

test("前置ゴミ付きPDFでページツリー走査および間接オブジェクト（MediaBox, /Info Title）が正しく解決されること", async () => {
  const pdf = buildSinglePagePdfWithInfo({
    title: "Test Doc",
    author: "Antigravity",
  });
  const withJunk = withLeadingJunk(50, pdf);
  const result = await PdfDocument.load(withJunk);

  assert(result.ok);
  expect(result.value.metadata.title).toBe("Test Doc");
  expect(result.value.metadata.author).toBe("Antigravity");
  const page = result.value.getPage(0);
  assert(page.some);
  expect(page.value.mediaBox).toEqual([0, 0, 612, 792]);
});

test("NULLバイト・高位バイト（0xFF）を含むバイナリ前置ゴミが付加されたPDFが正常に読み込めること", async () => {
  const binaryJunk = new Uint8Array([0x00, 0xff, 0xfe, 0x1b, 0x80, 0x00, 0x7f]);
  const pdf = buildMinimalSinglePagePdf();
  const withJunk = withLeadingJunk(binaryJunk, pdf);
  const result = await PdfDocument.load(withJunk);

  assert(result.ok);
  expect(result.value.pageCount).toBe(1);
});

test("% が連続する不完全シグネチャゴミ（%%%PDF-）が付加されたPDFが正常に読み込めること", async () => {
  const percentJunk = new TextEncoder().encode("%%%");
  const pdf = buildMinimalSinglePagePdf();
  const withJunk = withLeadingJunk(percentJunk, pdf);
  const result = await PdfDocument.load(withJunk);

  assert(result.ok);
  expect(result.value.pageCount).toBe(1);
});
