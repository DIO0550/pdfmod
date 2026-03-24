import { expect, test } from "vitest";
import {
  LRUCache,
  TokenType,
  Tokenizer,
  parseXRefTable,
  scanStartXRef,
} from "./index.js";

test("Tokenizerがルートからexportされている", () => {
  expect(typeof Tokenizer).toBe("function");
});

test("LRUCache.createがルートからexportされている", () => {
  expect(typeof LRUCache.create).toBe("function");
});

test("TokenType enumがルートからexportされている", () => {
  expect(TokenType.Integer).toBeDefined();
  expect(TokenType.EOF).toBeDefined();
});

test("scanStartXRefがルートからexportされている", () => {
  expect(typeof scanStartXRef).toBe("function");
});

test("parseXRefTableがルートからexportされている", () => {
  expect(typeof parseXRefTable).toBe("function");
});
