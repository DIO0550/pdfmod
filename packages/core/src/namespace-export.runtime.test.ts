import { expect, test } from "vitest";
import {
  ByteOffset,
  createFlateDecompressor,
  GenerationNumber,
  LRUCache,
  ObjectNumber,
  ObjectStreamExtractor,
  parseHeader,
  parseTrailer,
  parseXRefTable,
  scanStartXRef,
  Tokenizer,
  TokenType,
  validateStreamDict,
} from "./index";

test.each([
  { name: "Tokenizer", value: Tokenizer },
  { name: "LRUCache.create", value: LRUCache.create },
  { name: "scanStartXRef", value: scanStartXRef },
  { name: "parseXRefTable", value: parseXRefTable },
  { name: "parseTrailer", value: parseTrailer },
  { name: "ObjectStreamExtractor.create", value: ObjectStreamExtractor.create },
  { name: "parseHeader", value: parseHeader },
  { name: "validateStreamDict", value: validateStreamDict },
  { name: "createFlateDecompressor", value: createFlateDecompressor },
])("$nameがルートからexportされている", ({ value }) => {
  expect(typeof value).toBe("function");
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
