import { expect, test } from "vitest";
import { TokenType } from "../types/index";
import { Tokenizer } from "./tokenizer";

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
  expect(tokens[0]).toMatchObject({
    type: TokenType.LiteralString,
    value: "Hello World",
  });
});

test("ネストされた括弧を含むリテラル文字列を処理する", () => {
  const tokens = tokenize("(Hello (nested) World)");
  expect(tokens[0]).toMatchObject({
    type: TokenType.LiteralString,
    value: "Hello (nested) World",
  });
});

test("エスケープシーケンスを含むリテラル文字列を処理する", () => {
  const tokens = tokenize("(line1\\nline2\\ttab)");
  expect(tokens[0]).toMatchObject({
    type: TokenType.LiteralString,
    value: "line1\nline2\ttab",
  });
});

test("16進文字列をトークナイズする", () => {
  const tokens = tokenize("<48656C6C6F>");
  expect(tokens[0]).toMatchObject({
    type: TokenType.HexString,
    value: "48656C6C6F",
  });
});

test("辞書デリミタと16進文字列を区別する", () => {
  const tokens = tokenize("<< /Key (value) >>");
  expect(tokens[0]).toMatchObject({ type: TokenType.DictBegin });
  expect(tokens[1]).toMatchObject({ type: TokenType.Name, value: "Key" });
  expect(tokens[2]).toMatchObject({
    type: TokenType.LiteralString,
    value: "value",
  });
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
  expect(tokens[5]).toMatchObject({
    type: TokenType.Keyword,
    value: "endstream",
  });
});

// --- Edge case tests ---

test("不正数値 12abc はキーワードにフォールバックする", () => {
  const tokens = tokenize("12abc");
  expect(tokens[0]).toMatchObject({
    type: TokenType.Keyword,
    value: "12abc",
  });
});

test("不正数値 1.2.3 はキーワードにフォールバックする", () => {
  const tokens = tokenize("1.2.3");
  expect(tokens[0]).toMatchObject({
    type: TokenType.Keyword,
    value: "1.2.3",
  });
});

test("ドット単独 . は Real (NaN) になる", () => {
  const tokens = tokenize(".");
  expect(tokens[0].type).toBe(TokenType.Real);
  expect(tokens[0].value).toBeNaN();
});

test("符号単独 + は Integer (NaN) になる", () => {
  const tokens = tokenize("+");
  expect(tokens[0].type).toBe(TokenType.Integer);
  expect(tokens[0].value).toBeNaN();
});

test("符号単独 - は Integer (NaN) になる", () => {
  const tokens = tokenize("-");
  expect(tokens[0].type).toBe(TokenType.Integer);
  expect(tokens[0].value).toBeNaN();
});

test("空リテラル文字列 () をトークナイズする", () => {
  const tokens = tokenize("()");
  expect(tokens[0]).toMatchObject({ type: TokenType.LiteralString, value: "" });
});

test("空16進文字列 <> をトークナイズする", () => {
  const tokens = tokenize("<>");
  expect(tokens[0]).toMatchObject({ type: TokenType.HexString, value: "" });
});

test("奇数桁16進文字列 <F> をトークナイズする", () => {
  const tokens = tokenize("<F>");
  expect(tokens[0]).toMatchObject({ type: TokenType.HexString, value: "F" });
});

test.each([
  ["(a\\rb)", "a\rb"],
  ["(a\\bb)", "a\bb"],
  ["(a\\fb)", "a\fb"],
  ["(a\\(b)", "a(b"],
  ["(a\\)b)", "a)b"],
  ["(a\\\\b)", "a\\b"],
])("エスケープ %s を処理する", (input, expected) => {
  const tokens = tokenize(input);
  expect(tokens[0]).toMatchObject({
    type: TokenType.LiteralString,
    value: expected,
  });
});

test("未知エスケープはそのまま通す", () => {
  const tokens = tokenize("(a\\xb)");
  expect(tokens[0]).toMatchObject({
    type: TokenType.LiteralString,
    value: "axb",
  });
});

test("EOF直前のバックスラッシュを処理する", () => {
  const tokens = tokenize("(a\\");
  expect(tokens[0]).toMatchObject({
    type: TokenType.LiteralString,
    value: "a",
  });
});

test("オクタルエスケープ \\053 を処理する", () => {
  const tokens = tokenize("(\\053)");
  expect(tokens[0]).toMatchObject({
    type: TokenType.LiteralString,
    value: "+",
  });
});

test("1桁オクタルエスケープ \\5 を処理する", () => {
  const tokens = tokenize("(\\5)");
  expect(tokens[0]).toMatchObject({
    type: TokenType.LiteralString,
    value: "\x05",
  });
});

test("16進文字列内の空白を無視する", () => {
  const tokens = tokenize("<4 8 65 6C>");
  expect(tokens[0]).toMatchObject({
    type: TokenType.HexString,
    value: "48656C",
  });
});

test.each([
  ["/", ""],
  ["/A#", "A#"],
  ["/A#1", "A#1"],
])("Name エッジケース %s を処理する", (input, expected) => {
  const tokens = tokenize(input);
  expect(tokens[0]).toMatchObject({ type: TokenType.Name, value: expected });
});

test("Name の不正hexエスケープ /A#GG は #GG を16進デコードする", () => {
  const tokens = tokenize("/A#GG");
  const name = tokens[0];
  expect(name.type).toBe(TokenType.Name);
  // parseInt("GG", 16) = NaN → String.fromCharCode(NaN) = "\u0000"
  expect(name.value).toBe("A\u0000");
});

test.each([
  ["trueX", TokenType.Keyword, "trueX"],
  ["false0", TokenType.Keyword, "false0"],
  ["nullX", TokenType.Keyword, "nullX"],
])("Boolean/null境界 %s はキーワードになる", (input, expectedType, expectedValue) => {
  const tokens = tokenize(input);
  expect(tokens[0]).toMatchObject({ type: expectedType, value: expectedValue });
});

test("単独 > はキーワードになる", () => {
  const tokens = tokenize(">");
  expect(tokens[0]).toMatchObject({ type: TokenType.Keyword, value: ">" });
});
