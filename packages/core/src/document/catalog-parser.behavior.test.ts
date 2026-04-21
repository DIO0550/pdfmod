import { expect, test } from "vitest";
import type { PdfError } from "../pdf/errors/error/index";
import type { PdfObject, PdfValue } from "../pdf/types/pdf-types/index";
import { err, ok } from "../utils/result/index";
import { CatalogParser } from "./catalog-parser";
import {
  makeCatalogEntries,
  makeRef,
  makeResolverStub,
  makeTrailerDict,
  okDict,
  pdfVersion,
} from "./catalog-parser.test.helpers";

const validPagesRef: PdfValue = {
  type: "indirect-ref",
  objectNumber: 2,
  generationNumber: 0,
};
const validCatalogName: PdfValue = { type: "name", value: "Catalog" };

const resolveToDict = (
  entries: Map<string, PdfValue>,
): ReturnType<typeof makeResolverStub> =>
  makeResolverStub(async () => ok(okDict(entries)));

test("/Type が欠損している場合 CATALOG_TYPE_INVALID を返す", async () => {
  const entries = makeCatalogEntries({ pages: validPagesRef });
  const result = await CatalogParser.parse(
    makeTrailerDict(makeRef(1)),
    pdfVersion("1.7"),
    resolveToDict(entries),
  );
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: PdfError }).error.code).toBe(
    "CATALOG_TYPE_INVALID",
  );
});

test("/Type が /Catalog でない場合 CATALOG_TYPE_INVALID を返す", async () => {
  const entries = makeCatalogEntries({
    type: { type: "name", value: "Pages" },
    pages: validPagesRef,
  });
  const result = await CatalogParser.parse(
    makeTrailerDict(makeRef(1)),
    pdfVersion("1.7"),
    resolveToDict(entries),
  );
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: PdfError }).error.code).toBe(
    "CATALOG_TYPE_INVALID",
  );
});

test("/Pages が欠損している場合 PAGES_NOT_FOUND を返す", async () => {
  const entries = makeCatalogEntries({ type: validCatalogName });
  const result = await CatalogParser.parse(
    makeTrailerDict(makeRef(1)),
    pdfVersion("1.7"),
    resolveToDict(entries),
  );
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: PdfError }).error.code).toBe(
    "PAGES_NOT_FOUND",
  );
});

test("/Pages が indirect-ref でない場合 PAGES_NOT_FOUND を返す", async () => {
  const entries = makeCatalogEntries({
    type: validCatalogName,
    pages: { type: "integer", value: 2 },
  });
  const result = await CatalogParser.parse(
    makeTrailerDict(makeRef(1)),
    pdfVersion("1.7"),
    resolveToDict(entries),
  );
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: PdfError }).error.code).toBe(
    "PAGES_NOT_FOUND",
  );
});

test.each([
  -1,
  0,
  Number.NaN,
  1.5,
])("/Pages.objectNumber が非正の safe int (%s) で PAGES_NOT_FOUND", async (objectNumber) => {
  const entries = makeCatalogEntries({
    type: validCatalogName,
    pages: { type: "indirect-ref", objectNumber, generationNumber: 0 },
  });
  const result = await CatalogParser.parse(
    makeTrailerDict(makeRef(1)),
    pdfVersion("1.7"),
    resolveToDict(entries),
  );
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: PdfError }).error.code).toBe(
    "PAGES_NOT_FOUND",
  );
});

test.each([
  -1,
  Number.NaN,
  1.5,
])("/Pages.generationNumber が非 safe int (%s) で PAGES_NOT_FOUND", async (generationNumber) => {
  const entries = makeCatalogEntries({
    type: validCatalogName,
    pages: { type: "indirect-ref", objectNumber: 2, generationNumber },
  });
  const result = await CatalogParser.parse(
    makeTrailerDict(makeRef(1)),
    pdfVersion("1.7"),
    resolveToDict(entries),
  );
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: PdfError }).error.code).toBe(
    "PAGES_NOT_FOUND",
  );
});

test("/Pages.generationNumber が 65535 を超えると PAGES_NOT_FOUND", async () => {
  const entries = makeCatalogEntries({
    type: validCatalogName,
    pages: {
      type: "indirect-ref",
      objectNumber: 2,
      generationNumber: 70000,
    },
  });
  const result = await CatalogParser.parse(
    makeTrailerDict(makeRef(1)),
    pdfVersion("1.7"),
    resolveToDict(entries),
  );
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: PdfError }).error.code).toBe(
    "PAGES_NOT_FOUND",
  );
});

test("resolver が Err を返した場合 PdfError をそのまま伝播する", async () => {
  const circErr: PdfError = {
    code: "CIRCULAR_REFERENCE",
    message: "循環参照",
    objectId: { objectNumber: 1, generationNumber: 0 } as never,
  };
  const stub = makeResolverStub(async () => err(circErr));
  const result = await CatalogParser.parse(
    makeTrailerDict(makeRef(1)),
    pdfVersion("1.7"),
    stub,
  );
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: PdfError }).error).toBe(circErr);
});

test("resolver が辞書でない値を返した場合 CATALOG_ROOT_NOT_DICTIONARY を返す", async () => {
  const nullObj: PdfObject = { type: "null" };
  const stub = makeResolverStub(async () => ok(nullObj));
  const result = await CatalogParser.parse(
    makeTrailerDict(makeRef(1)),
    pdfVersion("1.7"),
    stub,
  );
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: PdfError }).error.code).toBe(
    "CATALOG_ROOT_NOT_DICTIONARY",
  );
});

test("/Type /Catalog + /Pages 間接参照が揃う場合 Ok を返す", async () => {
  const entries = makeCatalogEntries({
    type: validCatalogName,
    pages: validPagesRef,
  });
  const result = await CatalogParser.parse(
    makeTrailerDict(makeRef(1)),
    pdfVersion("1.7"),
    resolveToDict(entries),
  );
  expect(result.ok).toBe(true);
  const parsed = (result as { ok: true; value: unknown }).value as {
    pagesRef: { objectNumber: number; generationNumber: number };
    version: string;
  };
  expect(parsed.pagesRef.objectNumber).toBe(2);
  expect(parsed.pagesRef.generationNumber).toBe(0);
  expect(parsed.version as string).toBe("1.7");
});

test("/Version が欠損ならヘッダバージョンを採用", async () => {
  const entries = makeCatalogEntries({
    type: validCatalogName,
    pages: validPagesRef,
  });
  const result = await CatalogParser.parse(
    makeTrailerDict(makeRef(1)),
    pdfVersion("1.7"),
    resolveToDict(entries),
  );
  expect(result.ok).toBe(true);
  expect(
    (result as { ok: true; value: { version: string } }).value
      .version as string,
  ).toBe("1.7");
});

test("/Version が name でなければヘッダを採用", async () => {
  const entries = makeCatalogEntries({
    type: validCatalogName,
    pages: validPagesRef,
    version: { type: "integer", value: 2 },
  });
  const result = await CatalogParser.parse(
    makeTrailerDict(makeRef(1)),
    pdfVersion("1.7"),
    resolveToDict(entries),
  );
  expect(result.ok).toBe(true);
  expect(
    (result as { ok: true; value: { version: string } }).value
      .version as string,
  ).toBe("1.7");
});

test("/Version が major.minor 形式でなければヘッダを採用", async () => {
  const entries = makeCatalogEntries({
    type: validCatalogName,
    pages: validPagesRef,
    version: { type: "name", value: "1.x" },
  });
  const result = await CatalogParser.parse(
    makeTrailerDict(makeRef(1)),
    pdfVersion("1.7"),
    resolveToDict(entries),
  );
  expect(result.ok).toBe(true);
  expect(
    (result as { ok: true; value: { version: string } }).value
      .version as string,
  ).toBe("1.7");
});

test("/Version がヘッダと同値ならヘッダを採用", async () => {
  const entries = makeCatalogEntries({
    type: validCatalogName,
    pages: validPagesRef,
    version: { type: "name", value: "1.7" },
  });
  const result = await CatalogParser.parse(
    makeTrailerDict(makeRef(1)),
    pdfVersion("1.7"),
    resolveToDict(entries),
  );
  expect(result.ok).toBe(true);
  expect(
    (result as { ok: true; value: { version: string } }).value
      .version as string,
  ).toBe("1.7");
});

test("/Version が major 上位ならカタログを採用 (header=1.7, catalog=2.0)", async () => {
  const entries = makeCatalogEntries({
    type: validCatalogName,
    pages: validPagesRef,
    version: { type: "name", value: "2.0" },
  });
  const result = await CatalogParser.parse(
    makeTrailerDict(makeRef(1)),
    pdfVersion("1.7"),
    resolveToDict(entries),
  );
  expect(result.ok).toBe(true);
  expect(
    (result as { ok: true; value: { version: string } }).value
      .version as string,
  ).toBe("2.0");
});

test("/Version が minor 上位ならカタログを採用 (header=1.5, catalog=1.7)", async () => {
  const entries = makeCatalogEntries({
    type: validCatalogName,
    pages: validPagesRef,
    version: { type: "name", value: "1.7" },
  });
  const result = await CatalogParser.parse(
    makeTrailerDict(makeRef(1)),
    pdfVersion("1.5"),
    resolveToDict(entries),
  );
  expect(result.ok).toBe(true);
  expect(
    (result as { ok: true; value: { version: string } }).value
      .version as string,
  ).toBe("1.7");
});
