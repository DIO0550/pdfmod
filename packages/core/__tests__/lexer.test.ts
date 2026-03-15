import { describe, it, expect } from "vitest";
import { Tokenizer, TokenType } from "../src/index.js";

function tokenize(input: string) {
  const encoder = new TextEncoder();
  const tokenizer = new Tokenizer(encoder.encode(input));
  return tokenizer.tokenize();
}

describe("Tokenizer", () => {
  it("should tokenize integer numbers", () => {
    const tokens = tokenize("42 -17 +5");
    expect(tokens[0]).toMatchObject({
      type: TokenType.Integer,
      value: 42,
    });
    expect(tokens[1]).toMatchObject({
      type: TokenType.Integer,
      value: -17,
    });
    expect(tokens[2]).toMatchObject({
      type: TokenType.Integer,
      value: 5,
    });
  });

  it("should tokenize real numbers", () => {
    const tokens = tokenize("3.14 -2.0 .5");
    expect(tokens[0]).toMatchObject({
      type: TokenType.Real,
      value: 3.14,
    });
    expect(tokens[1]).toMatchObject({
      type: TokenType.Real,
      value: -2.0,
    });
    expect(tokens[2]).toMatchObject({
      type: TokenType.Real,
      value: 0.5,
    });
  });

  it("should tokenize boolean and null keywords", () => {
    const tokens = tokenize("true false null");
    expect(tokens[0]).toMatchObject({ type: TokenType.Boolean, value: true });
    expect(tokens[1]).toMatchObject({ type: TokenType.Boolean, value: false });
    expect(tokens[2]).toMatchObject({ type: TokenType.Null, value: null });
  });

  it("should tokenize name objects", () => {
    const tokens = tokenize("/Type /Page /Font#20Name");
    expect(tokens[0]).toMatchObject({ type: TokenType.Name, value: "Type" });
    expect(tokens[1]).toMatchObject({ type: TokenType.Name, value: "Page" });
    expect(tokens[2]).toMatchObject({
      type: TokenType.Name,
      value: "Font Name",
    });
  });

  it("should tokenize literal strings", () => {
    const tokens = tokenize("(Hello World)");
    expect(tokens[0]).toMatchObject({
      type: TokenType.LiteralString,
      value: "Hello World",
    });
  });

  it("should handle nested parentheses in literal strings", () => {
    const tokens = tokenize("(Hello (nested) World)");
    expect(tokens[0]).toMatchObject({
      type: TokenType.LiteralString,
      value: "Hello (nested) World",
    });
  });

  it("should handle escape sequences in literal strings", () => {
    const tokens = tokenize("(line1\\nline2\\ttab)");
    expect(tokens[0]).toMatchObject({
      type: TokenType.LiteralString,
      value: "line1\nline2\ttab",
    });
  });

  it("should tokenize hex strings", () => {
    const tokens = tokenize("<48656C6C6F>");
    expect(tokens[0]).toMatchObject({
      type: TokenType.HexString,
      value: "48656C6C6F",
    });
  });

  it("should distinguish dict delimiters from hex strings", () => {
    const tokens = tokenize("<< /Key (value) >>");
    expect(tokens[0]).toMatchObject({ type: TokenType.DictBegin });
    expect(tokens[1]).toMatchObject({ type: TokenType.Name, value: "Key" });
    expect(tokens[2]).toMatchObject({
      type: TokenType.LiteralString,
      value: "value",
    });
    expect(tokens[3]).toMatchObject({ type: TokenType.DictEnd });
  });

  it("should tokenize array delimiters", () => {
    const tokens = tokenize("[1 2 3]");
    expect(tokens[0]).toMatchObject({ type: TokenType.ArrayBegin });
    expect(tokens[1]).toMatchObject({ type: TokenType.Integer, value: 1 });
    expect(tokens[2]).toMatchObject({ type: TokenType.Integer, value: 2 });
    expect(tokens[3]).toMatchObject({ type: TokenType.Integer, value: 3 });
    expect(tokens[4]).toMatchObject({ type: TokenType.ArrayEnd });
  });

  it("should tokenize PDF keywords", () => {
    const tokens = tokenize("1 0 obj endobj stream endstream");
    expect(tokens[0]).toMatchObject({ type: TokenType.Integer, value: 1 });
    expect(tokens[1]).toMatchObject({ type: TokenType.Integer, value: 0 });
    expect(tokens[2]).toMatchObject({ type: TokenType.Keyword, value: "obj" });
    expect(tokens[3]).toMatchObject({
      type: TokenType.Keyword,
      value: "endobj",
    });
    expect(tokens[4]).toMatchObject({
      type: TokenType.Keyword,
      value: "stream",
    });
    expect(tokens[5]).toMatchObject({
      type: TokenType.Keyword,
      value: "endstream",
    });
  });

  it("should skip comments", () => {
    const tokens = tokenize("42 % this is a comment\n17");
    expect(tokens[0]).toMatchObject({ type: TokenType.Integer, value: 42 });
    expect(tokens[1]).toMatchObject({ type: TokenType.Integer, value: 17 });
    expect(tokens[2]).toMatchObject({ type: TokenType.EOF });
  });

  it("should produce EOF token at end of input", () => {
    const tokens = tokenize("");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe(TokenType.EOF);
  });

  it("should record correct offsets", () => {
    const tokens = tokenize("/Name 42");
    expect(tokens[0].offset).toBe(0);
    expect(tokens[1].offset).toBe(6);
  });
});
