import { test, expect } from "vitest";
import { Tokenizer } from "./tokenizer.js";
import { TokenType } from "../types/index.js";

function tokenize(input: string) {
  const encoder = new TextEncoder();
  const tokenizer = new Tokenizer(encoder.encode(input));
  return tokenizer.tokenize();
}

test("整数をトークナイズする", () => {
  const tokens = tokenize("42 -17 +5");
  expect(tokens[0]).toMatchObject({ type: TokenType.Integer, value: 42 });
  expect(tokens[1]).toMatchObject({ type: TokenType.Integer, value: -17 });
  expect(tokens[2]).toMatchObject({ type: TokenType.Integer, value: 5 });
});

test("実数をトークナイズする", () => {
  const tokens = tokenize("3.14 -2.0 .5");
  expect(tokens[0]).toMatchObject({ type: TokenType.Real, value: 3.14 });
  expect(tokens[1]).toMatchObject({ type: TokenType.Real, value: -2.0 });
  expect(tokens[2]).toMatchObject({ type: TokenType.Real, value: 0.5 });
});

test("boolean・nullキーワードをトークナイズする", () => {
  const tokens = tokenize("true false null");
  expect(tokens[0]).toMatchObject({ type: TokenType.Boolean, value: true });
  expect(tokens[1]).toMatchObject({ type: TokenType.Boolean, value: false });
  expect(tokens[2]).toMatchObject({ type: TokenType.Null, value: null });
});

test("名前オブジェクトをトークナイズする", () => {
  const tokens = tokenize("/Type /Page /Font#20Name");
  expect(tokens[0]).toMatchObject({ type: TokenType.Name, value: "Type" });
  expect(tokens[1]).toMatchObject({ type: TokenType.Name, value: "Page" });
  expect(tokens[2]).toMatchObject({ type: TokenType.Name, value: "Font Name" });
});

test("リテラル文字列をトークナイズする", () => {
  const tokens = tokenize("(Hello World)");
  expect(tokens[0]).toMatchObject({ type: TokenType.LiteralString, value: "Hello World" });
});

test("ネストされた括弧を含むリテラル文字列を処理する", () => {
  const tokens = tokenize("(Hello (nested) World)");
  expect(tokens[0]).toMatchObject({ type: TokenType.LiteralString, value: "Hello (nested) World" });
});

test("エスケープシーケンスを含むリテラル文字列を処理する", () => {
  const tokens = tokenize("(line1\\nline2\\ttab)");
  expect(tokens[0]).toMatchObject({ type: TokenType.LiteralString, value: "line1\nline2\ttab" });
});

test("16進文字列をトークナイズする", () => {
  const tokens = tokenize("<48656C6C6F>");
  expect(tokens[0]).toMatchObject({ type: TokenType.HexString, value: "48656C6C6F" });
});

test("辞書デリミタと16進文字列を区別する", () => {
  const tokens = tokenize("<< /Key (value) >>");
  expect(tokens[0]).toMatchObject({ type: TokenType.DictBegin });
  expect(tokens[1]).toMatchObject({ type: TokenType.Name, value: "Key" });
  expect(tokens[2]).toMatchObject({ type: TokenType.LiteralString, value: "value" });
  expect(tokens[3]).toMatchObject({ type: TokenType.DictEnd });
});

test("配列デリミタをトークナイズする", () => {
  const tokens = tokenize("[1 2 3]");
  expect(tokens[0]).toMatchObject({ type: TokenType.ArrayBegin });
  expect(tokens[1]).toMatchObject({ type: TokenType.Integer, value: 1 });
  expect(tokens[2]).toMatchObject({ type: TokenType.Integer, value: 2 });
  expect(tokens[3]).toMatchObject({ type: TokenType.Integer, value: 3 });
  expect(tokens[4]).toMatchObject({ type: TokenType.ArrayEnd });
});

test("PDFキーワードをトークナイズする", () => {
  const tokens = tokenize("1 0 obj endobj stream endstream");
  expect(tokens[0]).toMatchObject({ type: TokenType.Integer, value: 1 });
  expect(tokens[1]).toMatchObject({ type: TokenType.Integer, value: 0 });
  expect(tokens[2]).toMatchObject({ type: TokenType.Keyword, value: "obj" });
  expect(tokens[3]).toMatchObject({ type: TokenType.Keyword, value: "endobj" });
  expect(tokens[4]).toMatchObject({ type: TokenType.Keyword, value: "stream" });
  expect(tokens[5]).toMatchObject({ type: TokenType.Keyword, value: "endstream" });
});
