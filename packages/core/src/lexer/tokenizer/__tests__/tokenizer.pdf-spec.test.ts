import { expect, test } from "vitest";
import { TokenType } from "../../../pdf/types/index";
import { Tokenizer } from "../index";

function tokenize(input: string): ReturnType<Tokenizer["tokenize"]> {
  const encoder = new TextEncoder();
  const tokenizer = new Tokenizer(encoder.encode(input));
  return tokenizer.tokenize();
}

test("間接参照 1 0 R をトークナイズする", () => {
  const tokens = tokenize("1 0 R");
  expect(tokens[0]).toMatchObject({ type: TokenType.Integer, value: 1 });
  expect(tokens[1]).toMatchObject({ type: TokenType.Integer, value: 0 });
  expect(tokens[2]).toMatchObject({ type: TokenType.Keyword, value: "R" });
});

test("非0世代の間接参照 5 3 R をトークナイズする", () => {
  const tokens = tokenize("5 3 R");
  expect(tokens[0]).toMatchObject({ type: TokenType.Integer, value: 5 });
  expect(tokens[1]).toMatchObject({ type: TokenType.Integer, value: 3 });
  expect(tokens[2]).toMatchObject({ type: TokenType.Keyword, value: "R" });
});

test("オブジェクト定義の完全なトークン列を処理する", () => {
  const tokens = tokenize("1 0 obj\n<< /Type /Page >>\nendobj");
  expect(tokens[0]).toMatchObject({ type: TokenType.Integer, value: 1 });
  expect(tokens[1]).toMatchObject({ type: TokenType.Integer, value: 0 });
  expect(tokens[2]).toMatchObject({ type: TokenType.Keyword, value: "obj" });
  expect(tokens[3]).toMatchObject({ type: TokenType.DictBegin });
  expect(tokens[4]).toMatchObject({ type: TokenType.Name, value: "Type" });
  expect(tokens[5]).toMatchObject({ type: TokenType.Name, value: "Page" });
  expect(tokens[6]).toMatchObject({ type: TokenType.DictEnd });
  expect(tokens[7]).toMatchObject({
    type: TokenType.Keyword,
    value: "endobj",
  });
});

test("PDF構造キーワード xref/trailer/startxref をトークナイズする", () => {
  const tokens = tokenize("xref\ntrailer\nstartxref");
  expect(tokens[0]).toMatchObject({ type: TokenType.Keyword, value: "xref" });
  expect(tokens[1]).toMatchObject({
    type: TokenType.Keyword,
    value: "trailer",
  });
  expect(tokens[2]).toMatchObject({
    type: TokenType.Keyword,
    value: "startxref",
  });
});

test.each([
  ["\\+LF", "(a\\\nb)", "ab"],
  ["\\+CR", "(a\\\rb)", "ab"],
  ["\\+CRLF", "(a\\\r\nb)", "ab"],
])("リテラル文字列内の行継続 %s はバックスラッシュとEOLを破棄して直結する", (_label, input, expected) => {
  const bytes = new TextEncoder().encode(input);
  const tokenizer = new Tokenizer(bytes);
  const token = tokenizer.nextToken();
  expect(token).toMatchObject({
    type: TokenType.LiteralString,
    value: expected,
  });
});

test.each([
  ["生LF", "(a\nb)", "a\nb"],
  ["生CR", "(a\rb)", "a\nb"],
  ["生CRLF", "(a\r\nb)", "a\nb"],
  ["連続生EOL (CRLF + LF)", "(a\r\n\nb)", "a\n\nb"],
  ["ネスト括弧内の生CRLF", "(a(\r\n)b)", "a(\n)b"],
])("リテラル文字列内の非エスケープEOL %s は単一のLF(\\n)に正規化される", (_label, input, expected) => {
  const bytes = new TextEncoder().encode(input);
  const tokenizer = new Tokenizer(bytes);
  const token = tokenizer.nextToken();
  expect(token).toMatchObject({
    type: TokenType.LiteralString,
    value: expected,
  });
});

test("リテラル文字列内のエスケープ \\r や \\n は正規化の影響を受けずそのまま保持される", () => {
  const bytes = new TextEncoder().encode("(a\\r\\nb)");
  const tokenizer = new Tokenizer(bytes);
  const token = tokenizer.nextToken();
  expect(token).toMatchObject({
    type: TokenType.LiteralString,
    value: "a\r\nb",
  });
});

test("リテラル文字列末尾でバックスラッシュ直後にEOFとなる場合、それまでの文字列を返す", () => {
  const bytes = new TextEncoder().encode("(abc\\");
  const tokenizer = new Tokenizer(bytes);
  const token = tokenizer.nextToken();
  expect(token).toMatchObject({
    type: TokenType.LiteralString,
    value: "abc",
  });
});

test("リテラル文字列末尾で行継続直後にEOFとなる場合、それまでの文字列を返す", () => {
  const bytes = new TextEncoder().encode("(abc\\\r\n");
  const tokenizer = new Tokenizer(bytes);
  const token = tokenizer.nextToken();
  expect(token).toMatchObject({
    type: TokenType.LiteralString,
    value: "abc",
  });
});

test("配列内の複数間接参照をトークナイズする", () => {
  const tokens = tokenize("[1 0 R 2 0 R]");
  expect(tokens[0]).toMatchObject({ type: TokenType.ArrayBegin });
  expect(tokens[1]).toMatchObject({ type: TokenType.Integer, value: 1 });
  expect(tokens[2]).toMatchObject({ type: TokenType.Integer, value: 0 });
  expect(tokens[3]).toMatchObject({ type: TokenType.Keyword, value: "R" });
  expect(tokens[4]).toMatchObject({ type: TokenType.Integer, value: 2 });
  expect(tokens[5]).toMatchObject({ type: TokenType.Integer, value: 0 });
  expect(tokens[6]).toMatchObject({ type: TokenType.Keyword, value: "R" });
  expect(tokens[7]).toMatchObject({ type: TokenType.ArrayEnd });
});

test("高位バイト(0xFF, 0x00)を含むバイト列をトークナイズする", () => {
  const bytes = new Uint8Array([
    0x28,
    0xff,
    0x00,
    0x41,
    0x29, // (0xFF 0x00 A)
  ]);
  const tokenizer = new Tokenizer(bytes);
  const token = tokenizer.nextToken();
  expect(token).toMatchObject({
    type: TokenType.LiteralString,
    value: "\xff\x00A",
  });
});

test("デリミタ直後の数値 [42] をトークナイズする", () => {
  const tokens = tokenize("[42]");
  expect(tokens[0]).toMatchObject({ type: TokenType.ArrayBegin });
  expect(tokens[1]).toMatchObject({ type: TokenType.Integer, value: 42 });
  expect(tokens[2]).toMatchObject({ type: TokenType.ArrayEnd });
});

test("連続デリミタ <<>> をトークナイズする", () => {
  const tokens = tokenize("<<>>");
  expect(tokens[0]).toMatchObject({ type: TokenType.DictBegin });
  expect(tokens[1]).toMatchObject({ type: TokenType.DictEnd });
});
