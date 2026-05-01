import { assert, expect, test } from "vitest";
import { PdfDocument } from "./pdf-document";
import { buildMinimalSinglePagePdf } from "./pdf-document.test.helpers";

test.each([
  { label: "負のインデックス", getIndex: () => -1 },
  {
    label: "ページ数以上のインデックス",
    getIndex: (document: PdfDocument) => document.pageCount,
  },
  { label: "整数でないインデックス", getIndex: () => 1.5 },
  { label: "NaN", getIndex: () => Number.NaN },
])("getPage($label) は None を返す", async ({ getIndex }) => {
  const result = await PdfDocument.load(buildMinimalSinglePagePdf());

  assert(result.ok);
  const index = getIndex(result.value);
  expect(result.value.getPage(index).some).toBe(false);
});

test("getPage(0) は Some を返す (DA-002)", async () => {
  const result = await PdfDocument.load(buildMinimalSinglePagePdf());

  assert(result.ok);
  expect(result.value.getPage(0).some).toBe(true);
});
