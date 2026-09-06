import { expect, test } from "vitest";
import type { PdfError } from "../../../../pdf/errors/error/index";
import type { PdfWarning } from "../../../../pdf/errors/warning/index";
import type {
  PdfObject,
  PdfValue,
} from "../../../../pdf/types/pdf-types/index";
import { err, ok } from "../../../../utils/result/index";
import { CatalogParser } from "../../catalog-parser";
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

test("/Version が欠損ならヘッダバージョンを採用し warnings は空", async () => {
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
  const parsed = (
    result as {
      ok: true;
      value: { version: string; warnings: readonly PdfWarning[] };
    }
  ).value;
  expect(parsed.version as string).toBe("1.7");
  expect(parsed.warnings).toHaveLength(0);
});

test("/Version が name でなければヘッダを採用し warnings は空", async () => {
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
  const parsed = (
    result as {
      ok: true;
      value: { version: string; warnings: readonly PdfWarning[] };
    }
  ).value;
  expect(parsed.version as string).toBe("1.7");
  expect(parsed.warnings).toHaveLength(0);
});

test.each([
  "1.x",
  "BogusName",
  "1.2.3",
  "",
])("/Version が不正 name '%s' の場合 CATALOG_VERSION_INVALID を warnings に push しヘッダを採用", async (invalidName) => {
  // pickNewerVersion は PdfVersion.create 失敗時に 1 件 warning を push、ヘッダ版へ fallback
  const entries = makeCatalogEntries({
    type: validCatalogName,
    pages: validPagesRef,
    version: { type: "name", value: invalidName },
  });
  const result = await CatalogParser.parse(
    makeTrailerDict(makeRef(1)),
    pdfVersion("1.7"),
    resolveToDict(entries),
  );
  expect(result.ok).toBe(true);
  const parsed = (
    result as {
      ok: true;
      value: { version: string; warnings: readonly PdfWarning[] };
    }
  ).value;
  expect(parsed.version as string).toBe("1.7");
  expect(parsed.warnings).toHaveLength(1);
  expect(parsed.warnings[0]?.code).toBe("CATALOG_VERSION_INVALID");
});

test("CATALOG_VERSION_INVALID の message に invalid name が含まれる", () => {
  // 検証補助: message から何が invalid だったか特定できる
  const invalidName = "BogusName";
  return CatalogParser.parse(
    makeTrailerDict(makeRef(1)),
    pdfVersion("1.7"),
    resolveToDict(
      makeCatalogEntries({
        type: validCatalogName,
        pages: validPagesRef,
        version: { type: "name", value: invalidName },
      }),
    ),
  ).then((result) => {
    expect(result.ok).toBe(true);
    const parsed = (
      result as { ok: true; value: { warnings: readonly PdfWarning[] } }
    ).value;
    expect(parsed.warnings[0]?.message).toContain(invalidName);
  });
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

// production の `/Pages 0 0 R` は object-parser が先に null へ畳むため、この関数には
// `{ type: "null" }` として届く。つまり PAGES_NOT_FOUND になる理由は
// `pages.type !== "indirect-ref"` であり、オブジェクト番号のガードではない（#334 / D-7b）。
test("/Pages が 0 G R 由来の null の場合 PAGES_NOT_FOUND を返す", async () => {
  const entries = makeCatalogEntries({
    type: validCatalogName,
    pages: { type: "null" },
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

// folding を経ずに 0 番の参照が届いた場合も、ObjectNumber.create が第二の壁として弾く。
test("/Pages の objectNumber が 0 の場合 PAGES_NOT_FOUND を返す", async () => {
  const entries = makeCatalogEntries({
    type: validCatalogName,
    pages: { type: "indirect-ref", objectNumber: 0, generationNumber: 0 },
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
