import { expect, test } from "vitest";
import {
  ByteOffset,
  CatalogParser,
  DocumentInfoParser,
  GenerationNumber,
  InheritanceResolver,
  LRUCache,
  ObjectNumber,
  ObjectParser,
  ObjectStore,
  ObjectStreamBody,
  ObjectStreamHeader,
  PageTreeWalker,
  PdfTrapped,
  PdfVersion,
  parseTrailer,
  parseXRefTable,
  scanStartXRef,
  Tokenizer,
  TokenType,
} from "./index";

test.each([
  { name: "Tokenizer", value: Tokenizer },
  { name: "LRUCache.create", value: LRUCache.create },
  { name: "scanStartXRef", value: scanStartXRef },
  { name: "parseXRefTable", value: parseXRefTable },
  { name: "parseTrailer", value: parseTrailer },
  { name: "ObjectParser.parse", value: ObjectParser.parse },
  {
    name: "ObjectParser.parseIndirectObject",
    value: ObjectParser.parseIndirectObject,
  },
  { name: "ObjectStore.create", value: ObjectStore.create },
  { name: "ObjectStreamBody.extract", value: ObjectStreamBody.extract },
  { name: "ObjectStreamHeader.parse", value: ObjectStreamHeader.parse },
  { name: "CatalogParser.parse", value: CatalogParser.parse },
  { name: "PageTreeWalker.walk", value: PageTreeWalker.walk },
  { name: "InheritanceResolver.resolve", value: InheritanceResolver.resolve },
  { name: "DocumentInfoParser.parse", value: DocumentInfoParser.parse },
  { name: "PdfTrapped.create", value: PdfTrapped.create },
])("$nameがルートからexportされている", ({ value }) => {
  expect(typeof value).toBe("function");
});

test("PdfVersionコンパニオンがルートからexportされている", () => {
  expect(PdfVersion.create("1.7").ok).toBe(true);
  expect(PdfVersion.create("bogus").ok).toBe(false);
});

test("ObjectNumberコンパニオンがルートからexportされている", () => {
  expect(ObjectNumber.of(1)).toBe(1);
  expect(ObjectNumber.create(0).ok).toBe(true);
});

test("GenerationNumberコンパニオンがルートからexportされている", () => {
  expect(GenerationNumber.of(0)).toBe(0);
  expect(GenerationNumber.create(0).ok).toBe(true);
});

test("ByteOffsetコンパニオンがルートからexportされている", () => {
  expect(ByteOffset.of(100)).toBe(100);
  expect(ByteOffset.create(0).ok).toBe(true);
  expect(ByteOffset.add(ByteOffset.of(10), ByteOffset.of(20))).toBe(30);
});

test("TokenType enumがルートからexportされている", () => {
  expect(TokenType.Integer).toBeDefined();
  expect(TokenType.EOF).toBeDefined();
});
