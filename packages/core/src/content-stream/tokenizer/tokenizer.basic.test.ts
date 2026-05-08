import { assert, expect, test } from "vitest";
import type { Token } from "../../pdf/index";
import { ByteOffset, Operator, TokenType } from "../../pdf/index";
import { ContentStreamTokenizer } from "./index";

const encode = (input: string): Uint8Array => new TextEncoder().encode(input);

/**
 * Token 配列から EOF を除いた type を返す。
 *
 * @param tokens - 検証対象の Token 配列
 * @returns EOF を除いた TokenType 配列
 */
const tokenTypesWithoutEof = (tokens: readonly Token[]): TokenType[] =>
  tokens
    .filter((token) => token.type !== TokenType.EOF)
    .map((token) => token.type);

test("数値・文字列・名前リテラルとオペレータが混在するストリームをトークナイズする", () => {
  const tokenizer = new ContentStreamTokenizer(
    encode("10 20 m (Hi) Tj /F1 Tf"),
  );

  const result = tokenizer.tokenize();
  assert(result.ok);
  const tokens = result.value;

  expect(tokens.map((token) => token.type)).toEqual([
    TokenType.Integer,
    TokenType.Integer,
    TokenType.Operator,
    TokenType.LiteralString,
    TokenType.Operator,
    TokenType.Name,
    TokenType.Operator,
    TokenType.EOF,
  ]);
  expect(tokens[2]).toEqual(Operator.of("m", ByteOffset.of(6)));
  expect(tokens[4]).toEqual(Operator.of("Tj", ByteOffset.of(13)));
  expect(tokens[6]).toEqual(Operator.of("Tf", ByteOffset.of(20)));
});

test("nextTokenが1 tokenずつResult.okで返す", () => {
  const tokenizer = new ContentStreamTokenizer(encode("1 2 l"));

  const first = tokenizer.nextToken();
  const second = tokenizer.nextToken();
  const third = tokenizer.nextToken();
  const fourth = tokenizer.nextToken();

  assert(first.ok);
  assert(second.ok);
  assert(third.ok);
  assert(fourth.ok);
  expect(first.value.type).toBe(TokenType.Integer);
  expect(second.value.type).toBe(TokenType.Integer);
  expect(third.value).toEqual(Operator.of("l", ByteOffset.of(4)));
  expect(fourth.value.type).toBe(TokenType.EOF);
});

test("空入力はEOF tokenだけを返す", () => {
  const tokenizer = new ContentStreamTokenizer(encode(""));

  const result = tokenizer.tokenize();
  assert(result.ok);

  expect(result.value).toEqual([
    { type: TokenType.EOF, value: null, offset: ByteOffset.of(0) },
  ]);
});

test("true false nullはBooleanとNullのまま維持する", () => {
  const tokenizer = new ContentStreamTokenizer(encode("true false null"));

  const result = tokenizer.tokenize();
  assert(result.ok);

  expect(tokenTypesWithoutEof(result.value)).toEqual([
    TokenType.Boolean,
    TokenType.Boolean,
    TokenType.Null,
  ]);
});

test("配列delimiterを維持しTJだけをOperatorに変換する", () => {
  const tokenizer = new ContentStreamTokenizer(encode("[ (A) 120 (B) ] TJ"));

  const result = tokenizer.tokenize();
  assert(result.ok);
  const tokens = result.value;

  expect(tokenTypesWithoutEof(tokens)).toEqual([
    TokenType.ArrayBegin,
    TokenType.LiteralString,
    TokenType.Integer,
    TokenType.LiteralString,
    TokenType.ArrayEnd,
    TokenType.Operator,
  ]);
  expect(tokens[5]).toEqual(Operator.of("TJ", ByteOffset.of(16)));
});

test("辞書delimiterを維持しBDCだけをOperatorに変換する", () => {
  const tokenizer = new ContentStreamTokenizer(
    encode("<< /ActualText (x) >> BDC"),
  );

  const result = tokenizer.tokenize();
  assert(result.ok);
  const tokens = result.value;

  expect(tokenTypesWithoutEof(tokens)).toEqual([
    TokenType.DictBegin,
    TokenType.Name,
    TokenType.LiteralString,
    TokenType.DictEnd,
    TokenType.Operator,
  ]);
  expect(tokens[4]).toEqual(Operator.of("BDC", ByteOffset.of(22)));
});

test("inline imageを1つのtokenとして返す", () => {
  const tokenizer = new ContentStreamTokenizer(encode("BI /W 1 ID abc EI"));

  const result = tokenizer.tokenize();
  assert(result.ok);

  expect(result.value[0]).toMatchObject({
    type: TokenType.InlineImage,
    offset: ByteOffset.of(0),
  });
  expect(result.value[1]).toEqual({
    type: TokenType.EOF,
    value: null,
    offset: ByteOffset.of(17),
  });
});
