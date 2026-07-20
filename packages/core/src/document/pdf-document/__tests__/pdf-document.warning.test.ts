import { assert, expect, test } from "vitest";
import type { PdfWarning } from "../../../pdf/errors/warning/index";
import { PdfDocument } from "../../pdf-document";
import {
  buildMinimalSinglePagePdf,
  buildPdfWithCorruptStartXRef,
  buildPdfWithInvalidCatalogVersion,
  buildPdfWithInvalidInfoRef,
} from "./pdf-document.test.helpers";
import {
  buildPdfWithXRefStreamIndirectLengthAndBrokenPrev,
  buildSinglePagePdfWithXRefStreamIndirectLength,
} from "./pdf-document.xref-stream.test.helpers";

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
  expect(seen.map((w) => w.code)).toEqual(["XREF_REBUILD"]);
});

test("/Info の参照が不正な PDF を load すると INFO_RESOLVE_FAILED warning + 空 metadata になる (L-009)", async () => {
  const seen: PdfWarning[] = [];
  const result = await PdfDocument.load(buildPdfWithInvalidInfoRef(), {
    onWarning: (w) => seen.push(w),
  });

  assert(result.ok);
  expect(Object.keys(result.value.metadata)).toHaveLength(0);
  expect(seen.map((w) => w.code)).toEqual(["INFO_RESOLVE_FAILED"]);
});

test("Catalog /Version が invalid name の PDF を onWarning 指定で load すると CATALOG_VERSION_INVALID が観測される", async () => {
  // CatalogParser.parse が返す warnings が pdf-document/index.ts:293 の
  // emitWarnings 経由で onWarning に伝わる e2e smoke。
  const seen: PdfWarning[] = [];
  const result = await PdfDocument.load(buildPdfWithInvalidCatalogVersion(), {
    onWarning: (w) => seen.push(w),
  });

  assert(result.ok);
  expect(seen.map((w) => w.code)).toContain("CATALOG_VERSION_INVALID");
});

test("Catalog /Version が invalid name でも onWarning 未指定なら load は Ok を返す", async () => {
  // warning はエラーにならない後方互換の smoke
  const result = await PdfDocument.load(buildPdfWithInvalidCatalogVersion());

  assert(result.ok);
});

test("xrefストリーム自身の間接/LengthをonWarning指定でloadするとXREF_STREAM_LENGTH_BOOTSTRAPが観測される（Issue #549）", async () => {
  const seen: PdfWarning[] = [];
  const result = await PdfDocument.load(
    buildSinglePagePdfWithXRefStreamIndirectLength(),
    { onWarning: (w) => seen.push(w) },
  );

  assert(result.ok);
  expect(seen.map((w) => w.code)).toContain("XREF_STREAM_LENGTH_BOOTSTRAP");
});

test("新世代の間接/Length解決に成功してもchain全体が/Prev解析失敗でscanFallbackに切り替わった場合、XREF_STREAM_LENGTH_BOOTSTRAPは観測されない（Issue #549）", async () => {
  const seen: PdfWarning[] = [];
  const result = await PdfDocument.load(
    buildPdfWithXRefStreamIndirectLengthAndBrokenPrev(),
    { onWarning: (w) => seen.push(w) },
  );

  assert(result.ok);
  const codes = seen.map((w) => w.code);
  expect(codes).not.toContain("XREF_STREAM_LENGTH_BOOTSTRAP");
  expect(codes).toContain("XREF_REBUILD");
});
