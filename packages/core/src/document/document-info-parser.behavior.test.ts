import { expect, test, vi } from "vitest";
import type { PdfError } from "../pdf/errors/error/index";
import type {
  IndirectRef,
  PdfObject,
  PdfStream,
  PdfValue,
} from "../pdf/types/pdf-types/index";
import type { Result } from "../utils/result/index";
import { DocumentInfoParser } from "./document-info-parser";
import {
  literalString,
  makeInfoDict,
  makeRef,
  makeResolverWithInfo,
  makeTrailerNoInfo,
  makeTrailerWithInfo,
  unwrapOk,
  utf16BeString,
} from "./document-info-parser.test.helpers";

const failingResolver = (
  error: PdfError,
): ((ref: IndirectRef) => Promise<Result<PdfObject, PdfError>>) => {
  return async () => ({ ok: false, error });
};

test("/Info が trailer に無い場合は空 metadata と空 warnings を返し resolver を呼ばない", async () => {
  const resolver = vi.fn();
  const result = await DocumentInfoParser.parse(makeTrailerNoInfo(), resolver);
  const { metadata, warnings } = unwrapOk(result);
  expect(metadata).toEqual({});
  expect(warnings).toHaveLength(0);
  expect(resolver).not.toHaveBeenCalled();
});

test("/Info に ASCII Title のみがある場合 metadata.title が抽出される", async () => {
  const dict = makeInfoDict([["Title", literalString("Hello")]]);
  const resolver = makeResolverWithInfo(dict);
  const result = await DocumentInfoParser.parse(
    makeTrailerWithInfo(makeRef(2)),
    resolver,
  );
  const { metadata, warnings } = unwrapOk(result);
  expect(metadata.title).toBe("Hello");
  expect(warnings).toHaveLength(0);
});

test("/Info の Title / Author / Subject / Keywords / Creator / Producer が全て抽出される", async () => {
  const dict = makeInfoDict([
    ["Title", literalString("MyTitle")],
    ["Author", literalString("Alice")],
    ["Subject", literalString("Subject1")],
    ["Keywords", literalString("k1,k2")],
    ["Creator", literalString("CreatorApp")],
    ["Producer", literalString("ProducerApp")],
  ]);
  const result = await DocumentInfoParser.parse(
    makeTrailerWithInfo(makeRef(2)),
    makeResolverWithInfo(dict),
  );
  const { metadata, warnings } = unwrapOk(result);
  expect(metadata.title).toBe("MyTitle");
  expect(metadata.author).toBe("Alice");
  expect(metadata.subject).toBe("Subject1");
  expect(metadata.keywords).toBe("k1,k2");
  expect(metadata.creator).toBe("CreatorApp");
  expect(metadata.producer).toBe("ProducerApp");
  expect(warnings).toHaveLength(0);
});

test("/Title が UTF-16BE BOM 付き多言語文字列の場合に正しくデコードされる", async () => {
  const dict = makeInfoDict([["Title", utf16BeString("日本語")]]);
  const result = await DocumentInfoParser.parse(
    makeTrailerWithInfo(makeRef(2)),
    makeResolverWithInfo(dict),
  );
  const { metadata } = unwrapOk(result);
  expect(metadata.title).toBe("日本語");
});

test("/Title が UTF-16BE 補助平面 🚀 を含む場合に正しくデコードされる", async () => {
  const dict = makeInfoDict([["Title", utf16BeString("🚀 Launch")]]);
  const result = await DocumentInfoParser.parse(
    makeTrailerWithInfo(makeRef(2)),
    makeResolverWithInfo(dict),
  );
  const { metadata } = unwrapOk(result);
  expect(metadata.title).toBe("🚀 Launch");
});

test("/Title が PdfString 以外 (PdfInteger) の場合 undefined + STRING_DECODE_FAILED", async () => {
  const integerValue: PdfValue = { type: "integer", value: 42 };
  const dict = makeInfoDict([["Title", integerValue]]);
  const result = await DocumentInfoParser.parse(
    makeTrailerWithInfo(makeRef(2)),
    makeResolverWithInfo(dict),
  );
  const { metadata, warnings } = unwrapOk(result);
  expect(metadata.title).toBeUndefined();
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("STRING_DECODE_FAILED");
  expect(warnings[0].message).toContain("Title");
  expect(warnings[0].message).toContain("integer");
});

test("/CreationDate が D:20230615120530+09'00' の場合 UTC 換算 Date が抽出される", async () => {
  const dict = makeInfoDict([
    ["CreationDate", literalString("D:20230615120530+09'00'")],
  ]);
  const result = await DocumentInfoParser.parse(
    makeTrailerWithInfo(makeRef(2)),
    makeResolverWithInfo(dict),
  );
  const { metadata, warnings } = unwrapOk(result);
  expect(metadata.creationDate).toBeDefined();
  expect((metadata.creationDate as Date).getUTCHours()).toBe(3);
  expect((metadata.creationDate as Date).getUTCMinutes()).toBe(5);
  expect((metadata.creationDate as Date).getUTCSeconds()).toBe(30);
  expect(warnings).toHaveLength(0);
});

test("/ModDate が D:20240101000000Z の場合 UTC Date が抽出される", async () => {
  const dict = makeInfoDict([["ModDate", literalString("D:20240101000000Z")]]);
  const result = await DocumentInfoParser.parse(
    makeTrailerWithInfo(makeRef(2)),
    makeResolverWithInfo(dict),
  );
  const { metadata, warnings } = unwrapOk(result);
  expect(metadata.modDate).toBeDefined();
  expect((metadata.modDate as Date).getUTCFullYear()).toBe(2024);
  expect(warnings).toHaveLength(0);
});

test("/CreationDate が不正フォーマット D:abcd の場合 undefined + DATE_PARSE_FAILED", async () => {
  const dict = makeInfoDict([["CreationDate", literalString("D:abcd")]]);
  const result = await DocumentInfoParser.parse(
    makeTrailerWithInfo(makeRef(2)),
    makeResolverWithInfo(dict),
  );
  const { metadata, warnings } = unwrapOk(result);
  expect(metadata.creationDate).toBeUndefined();
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("DATE_PARSE_FAILED");
  expect(warnings[0].message).toContain("CreationDate");
});

test("/CreationDate が PdfString 以外 (PdfInteger) の場合 undefined + DATE_PARSE_FAILED", async () => {
  const integerValue: PdfValue = { type: "integer", value: 0 };
  const dict = makeInfoDict([["CreationDate", integerValue]]);
  const result = await DocumentInfoParser.parse(
    makeTrailerWithInfo(makeRef(2)),
    makeResolverWithInfo(dict),
  );
  const { metadata, warnings } = unwrapOk(result);
  expect(metadata.creationDate).toBeUndefined();
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("DATE_PARSE_FAILED");
  expect(warnings[0].message).toContain("CreationDate");
});

const VALID_TRAPPED: ReadonlyArray<readonly ["True" | "False" | "Unknown"]> = [
  ["True"],
  ["False"],
  ["Unknown"],
];

test.each(
  VALID_TRAPPED,
)("/Trapped Name '%s' が metadata.trapped に格納される", async (name) => {
  const trappedValue: PdfValue = { type: "name", value: name };
  const dict = makeInfoDict([["Trapped", trappedValue]]);
  const result = await DocumentInfoParser.parse(
    makeTrailerWithInfo(makeRef(2)),
    makeResolverWithInfo(dict),
  );
  const { metadata, warnings } = unwrapOk(result);
  expect(metadata.trapped).toBe(name);
  expect(warnings).toHaveLength(0);
});

test("/Trapped が未知 Name 'Yes' の場合 undefined + TRAPPED_INVALID", async () => {
  const trappedValue: PdfValue = { type: "name", value: "Yes" };
  const dict = makeInfoDict([["Trapped", trappedValue]]);
  const result = await DocumentInfoParser.parse(
    makeTrailerWithInfo(makeRef(2)),
    makeResolverWithInfo(dict),
  );
  const { metadata, warnings } = unwrapOk(result);
  expect(metadata.trapped).toBeUndefined();
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("TRAPPED_INVALID");
});

test("resolver が err を返した場合 INFO_RESOLVE_FAILED + 空 metadata", async () => {
  const infoRef = makeRef(2);
  const resolver = failingResolver({
    code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
    message: "object parse failed",
  });
  const result = await DocumentInfoParser.parse(
    makeTrailerWithInfo(infoRef),
    resolver,
  );
  const { metadata, warnings } = unwrapOk(result);
  expect(metadata).toEqual({});
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("INFO_RESOLVE_FAILED");
  expect(warnings[0].message).toContain("OBJECT_PARSE_UNEXPECTED_TOKEN");
  expect(warnings[0].message).toContain("2");
});

test("/Info が dictionary 以外 (stream) に解決された場合 INFO_NOT_DICTIONARY + 空 metadata", async () => {
  const stream: PdfStream = {
    type: "stream",
    dictionary: { type: "dictionary", entries: new Map() },
    data: new Uint8Array(),
  };
  const result = await DocumentInfoParser.parse(
    makeTrailerWithInfo(makeRef(2)),
    makeResolverWithInfo(stream),
  );
  const { metadata, warnings } = unwrapOk(result);
  expect(metadata).toEqual({});
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("INFO_NOT_DICTIONARY");
  expect(warnings[0].message).toContain("stream");
});

test("/Info に全フィールド（9 件）が揃った場合の統合抽出", async () => {
  const trappedValue: PdfValue = { type: "name", value: "True" };
  const dict = makeInfoDict([
    ["Title", literalString("MyDoc")],
    ["Author", literalString("Alice")],
    ["Subject", literalString("Sample")],
    ["Keywords", literalString("pdf,test")],
    ["Creator", literalString("MyApp")],
    ["Producer", literalString("ProducerLib")],
    ["CreationDate", literalString("D:20230615120530Z")],
    ["ModDate", literalString("D:20240101000000Z")],
    ["Trapped", trappedValue],
  ]);
  const result = await DocumentInfoParser.parse(
    makeTrailerWithInfo(makeRef(2)),
    makeResolverWithInfo(dict),
  );
  const { metadata, warnings } = unwrapOk(result);
  expect(metadata.title).toBe("MyDoc");
  expect(metadata.author).toBe("Alice");
  expect(metadata.subject).toBe("Sample");
  expect(metadata.keywords).toBe("pdf,test");
  expect(metadata.creator).toBe("MyApp");
  expect(metadata.producer).toBe("ProducerLib");
  expect((metadata.creationDate as Date).getUTCFullYear()).toBe(2023);
  expect((metadata.modDate as Date).getUTCFullYear()).toBe(2024);
  expect(metadata.trapped).toBe("True");
  expect(warnings).toHaveLength(0);
});
