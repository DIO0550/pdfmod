import { assert, expect, test } from "vitest";
import { PdfDocument } from "./pdf-document";
import {
  buildMinimalSinglePagePdf,
  buildSinglePagePdfWithInfo,
  buildTwoPagePdf,
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
