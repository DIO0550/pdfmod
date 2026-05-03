import { assert, expect, test } from "vitest";
import { PdfDocument } from "./pdf-document";
import {
  buildPdfHeaderOnly,
  buildPdfWithCorruptXRefAndNoTrailer,
  buildPdfWithoutCatalog,
  buildPdfWithoutMediaBox,
} from "./pdf-document.test.helpers";

test("空入力は INVALID_HEADER を返す", async () => {
  const result = await PdfDocument.load(new Uint8Array());

  expect(result.ok).toBe(false);
  assert(!result.ok);
  assert(!(result.error instanceof RangeError));
  expect(result.error.code).toBe("INVALID_HEADER");
});

test("`%PDF-` シグネチャ不在の入力は INVALID_HEADER を返す", async () => {
  const result = await PdfDocument.load(new TextEncoder().encode("not a pdf"));

  expect(result.ok).toBe(false);
  assert(!result.ok);
  assert(!(result.error instanceof RangeError));
  expect(result.error.code).toBe("INVALID_HEADER");
});

test("不明な PDF バージョン (`%PDF-9.9`) は INVALID_HEADER を返す", async () => {
  const result = await PdfDocument.load(new TextEncoder().encode("%PDF-9.9\n"));

  expect(result.ok).toBe(false);
  assert(!result.ok);
  assert(!(result.error instanceof RangeError));
  expect(result.error.code).toBe("INVALID_HEADER");
});

test("TAB 終端の `%PDF-1.7` は INVALID_HEADER を返さない", async () => {
  const result = await PdfDocument.load(
    new TextEncoder().encode("%PDF-1.7\trest of file"),
  );

  expect(result.ok).toBe(false);
  assert(!result.ok);
  assert(!(result.error instanceof RangeError));
  expect(result.error.code).not.toBe("INVALID_HEADER");
});

test("trailer 辞書が `/Root` を欠く PDF は ROOT_NOT_FOUND を返す", async () => {
  const result = await PdfDocument.load(buildPdfWithoutCatalog());

  expect(result.ok).toBe(false);
  assert(!result.ok);
  assert(!(result.error instanceof RangeError));
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
});

test("Page にも親 Pages にも MediaBox が無い PDF は MEDIABOX_NOT_FOUND を返す", async () => {
  const result = await PdfDocument.load(buildPdfWithoutMediaBox());

  expect(result.ok).toBe(false);
  assert(!result.ok);
  assert(!(result.error instanceof RangeError));
  expect(result.error.code).toBe("MEDIABOX_NOT_FOUND");
});

test("ヘッダのみで本体を持たない PDF は ROOT_NOT_FOUND を返す (L-002)", async () => {
  const result = await PdfDocument.load(buildPdfHeaderOnly());

  expect(result.ok).toBe(false);
  assert(!result.ok);
  assert(!(result.error instanceof RangeError));
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
});

test("xref 破損かつ fallback で trailer を確定できない PDF は ROOT_NOT_FOUND を返す", async () => {
  const result = await PdfDocument.load(buildPdfWithCorruptXRefAndNoTrailer());

  expect(result.ok).toBe(false);
  assert(!result.ok);
  assert(!(result.error instanceof RangeError));
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
});
