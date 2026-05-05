import { expect, test } from "vitest";
import type { Token } from "../../pdf/index";
import { ByteOffset, Operator, TokenType } from "../../pdf/index";
import type { Result } from "../../utils/result/index";
import { ContentStreamTokenizer } from "./index";

const encode = (input: string): Uint8Array => new TextEncoder().encode(input);

/**
 * Result.ok の値を取り出す。
 *
 * @param result - 検証対象の Result
 * @returns Result.ok の値
 */
const unwrapOk = <T>(result: Result<T, unknown>): T => {
  expect(result.ok).toBe(true);
  return (result as { ok: true; value: T }).value;
};

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

  const tokens = unwrapOk(tokenizer.tokenize());

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

  const first = unwrapOk(tokenizer.nextToken());
  const second = unwrapOk(tokenizer.nextToken());
  const third = unwrapOk(tokenizer.nextToken());
  const fourth = unwrapOk(tokenizer.nextToken());

  expect(first.type).toBe(TokenType.Integer);
  expect(second.type).toBe(TokenType.Integer);
  expect(third).toEqual(Operator.of("l", ByteOffset.of(4)));
  expect(fourth.type).toBe(TokenType.EOF);
});

test("空入力はEOF tokenだけを返す", () => {
  const tokenizer = new ContentStreamTokenizer(encode(""));

  const tokens = unwrapOk(tokenizer.tokenize());

  expect(tokens).toEqual([
    { type: TokenType.EOF, value: null, offset: ByteOffset.of(0) },
  ]);
});

test("true false nullはBooleanとNullのまま維持する", () => {
  const tokenizer = new ContentStreamTokenizer(encode("true false null"));

  const tokens = unwrapOk(tokenizer.tokenize());

  expect(tokenTypesWithoutEof(tokens)).toEqual([
    TokenType.Boolean,
    TokenType.Boolean,
    TokenType.Null,
  ]);
});

test("配列delimiterを維持しTJだけをOperatorに変換する", () => {
  const tokenizer = new ContentStreamTokenizer(encode("[ (A) 120 (B) ] TJ"));

  const tokens = unwrapOk(tokenizer.tokenize());

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

  const tokens = unwrapOk(tokenizer.tokenize());

  expect(tokenTypesWithoutEof(tokens)).toEqual([
    TokenType.DictBegin,
    TokenType.Name,
    TokenType.LiteralString,
    TokenType.DictEnd,
    TokenType.Operator,
  ]);
  expect(tokens[4]).toEqual(Operator.of("BDC", ByteOffset.of(22)));
});

test("inline image識別子自体は通常Operatorとして返す", () => {
  const tokenizer = new ContentStreamTokenizer(encode("BI ID EI"));

  const tokens = unwrapOk(tokenizer.tokenize());

  expect(tokenTypesWithoutEof(tokens)).toEqual([
    TokenType.Operator,
    TokenType.Operator,
    TokenType.Operator,
  ]);
  expect(tokens.slice(0, 3)).toEqual([
    Operator.of("BI", ByteOffset.of(0)),
    Operator.of("ID", ByteOffset.of(3)),
    Operator.of("EI", ByteOffset.of(6)),
  ]);
});
