import { assert, expect, test } from "vitest";
import type { PdfWarning } from "../pdf/errors/warning/index";
import { PdfDocument } from "./pdf-document";
import {
  buildMinimalSinglePagePdf,
  buildPdfWithCorruptStartXRef,
} from "./pdf-document.test.helpers";

test("/Info を持たない PDF を load すると metadata はキー数 0 の空オブジェクト (L-005)", async () => {
  const result = await PdfDocument.load(buildMinimalSinglePagePdf());

  assert(result.ok);
  expect(Object.keys(result.value.metadata)).toHaveLength(0);
});

test("/Info を持たない PDF を options 指定 + onWarning 未指定で load すると Ok を返す (L-005)", async () => {
  const result = await PdfDocument.load(buildMinimalSinglePagePdf(), {
    cacheCapacity: 1,
  });

  assert(result.ok);
});

test("xref 破損 PDF を onWarning 未指定で load すると Ok を返す (L-006)", async () => {
  const result = await PdfDocument.load(buildPdfWithCorruptStartXRef());

  assert(result.ok);
});

test("xref 破損 PDF を onWarning 指定で load すると XREF_REBUILD warning が観測される (L-007)", async () => {
  const seen: PdfWarning[] = [];
  const result = await PdfDocument.load(buildPdfWithCorruptStartXRef(), {
    onWarning: (w) => seen.push(w),
  });

  assert(result.ok);
  expect(seen.some((w) => w.code === "XREF_REBUILD")).toBe(true);
});
