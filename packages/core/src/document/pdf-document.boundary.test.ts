import { assert, expect, test } from "vitest";
import { PdfDocument } from "./pdf-document";
import { buildMinimalSinglePagePdf } from "./pdf-document.test.helpers";

test.each([
  { label: "負のインデックス", index: -1 },
  { label: "ページ数以上のインデックス", index: 1 },
  { label: "整数でないインデックス", index: 1.5 },
  { label: "NaN", index: Number.NaN },
])("getPage($label) は None を返す", async ({ index }) => {
  const result = await PdfDocument.load(buildMinimalSinglePagePdf());

  assert(result.ok);
  expect(result.value.getPage(index).some).toBe(false);
});

test("getPage(0) は Some を返す (DA-002)", async () => {
  const result = await PdfDocument.load(buildMinimalSinglePagePdf());

  assert(result.ok);
  expect(result.value.getPage(0).some).toBe(true);
});
