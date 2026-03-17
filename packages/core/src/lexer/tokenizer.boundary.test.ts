import { test, expect } from "vitest";
import { Tokenizer } from "./tokenizer.js";
import { TokenType } from "../types/index.js";

function tokenize(input: string) {
  const encoder = new TextEncoder();
  const tokenizer = new Tokenizer(encoder.encode(input));
  return tokenizer.tokenize();
}

test("コメントをスキップする", () => {
  const tokens = tokenize("42 % this is a comment\n17");
  expect(tokens[0]).toMatchObject({ type: TokenType.Integer, value: 42 });
  expect(tokens[1]).toMatchObject({ type: TokenType.Integer, value: 17 });
  expect(tokens[2]).toMatchObject({ type: TokenType.EOF });
});

test("空入力でEOFトークンを生成する", () => {
  const tokens = tokenize("");
  expect(tokens).toHaveLength(1);
  expect(tokens[0].type).toBe(TokenType.EOF);
});

test("正しいオフセットを記録する", () => {
  const tokens = tokenize("/Name 42");
  expect(tokens[0].offset).toBe(0);
  expect(tokens[1].offset).toBe(6);
});
