import { expect, test } from "vitest";
import {
  LRUCache,
  parseXRefTable,
  scanStartXRef,
  Tokenizer,
  TokenType,
} from "./index.js";

test.each([
  { name: "Tokenizer", value: Tokenizer },
  { name: "LRUCache.create", value: LRUCache.create },
  { name: "scanStartXRef", value: scanStartXRef },
  { name: "parseXRefTable", value: parseXRefTable },
])("$nameがルートからexportされている", ({ value }) => {
  expect(typeof value).toBe("function");
});

test("TokenType enumがルートからexportされている", () => {
  expect(TokenType.Integer).toBeDefined();
  expect(TokenType.EOF).toBeDefined();
});
