import { assert, expect, test } from "vitest";
import { PdfDocument } from "./pdf-document";
import { buildMinimalSinglePagePdf } from "./pdf-document.test.helpers";

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

test.each([
  { label: "負のインデックス", index: -1 },
  { label: "ページ数以上のインデックス", index: 1 },
  { label: "整数でないインデックス", index: 0.5 },
  { label: "NaN", index: Number.NaN },
])("getPage($label) は None を返す", async ({ index }) => {
  const result = await PdfDocument.load(buildMinimalSinglePagePdf());

  assert(result.ok);
  expect(result.value.getPage(index).some).toBe(false);
});
