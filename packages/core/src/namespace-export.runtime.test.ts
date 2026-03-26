import { expect, test } from "vitest";
import {
  LRUCache,
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
])("$nameがルートからexportされている", ({ value }) => {
  expect(typeof value).toBe("function");
});

test("TokenType enumがルートからexportされている", () => {
  expect(TokenType.Integer).toBeDefined();
  expect(TokenType.EOF).toBeDefined();
});
