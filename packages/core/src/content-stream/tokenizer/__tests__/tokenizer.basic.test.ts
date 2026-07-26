import { assert, expect, test } from "vitest";
import type { Token } from "../../../pdf/index";
import { ByteOffset, Operator, TokenType } from "../../../pdf/index";
import { ContentStreamTokenizer } from "../index";

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

// --- コメントスキップ ---

test("LF終端のコメントをスキップし後続トークンのByteOffsetが進む", () => {
  // "10 % xxx\n 20 m" = 14 bytes / 20 は index 10 / m は index 13
  const tokenizer = new ContentStreamTokenizer(encode("10 % xxx\n 20 m"));

  const result = tokenizer.tokenize();
  assert(result.ok);
  const tokens = result.value;

  expect(tokenTypesWithoutEof(tokens)).toEqual([
    TokenType.Integer,
    TokenType.Integer,
    TokenType.Operator,
  ]);
  expect(tokens[0]).toEqual({
    type: TokenType.Integer,
    value: 10,
    offset: ByteOffset.of(0),
  });
  expect(tokens[1]).toEqual({
    type: TokenType.Integer,
    value: 20,
    offset: ByteOffset.of(10),
  });
  expect(tokens[2]).toEqual(Operator.of("m", ByteOffset.of(13)));
  expect(tokens[3]).toEqual({
    type: TokenType.EOF,
    value: null,
    offset: ByteOffset.of(14),
  });
});

test("CR終端のコメントをスキップし後続トークンのByteOffsetが進む", () => {
  // "10 % xxx\r 20 m" = 14 bytes / CR は 1 byte なので LF 版と同じ offset
  const tokenizer = new ContentStreamTokenizer(encode("10 % xxx\r 20 m"));

  const result = tokenizer.tokenize();
  assert(result.ok);
  const tokens = result.value;

  expect(tokenTypesWithoutEof(tokens)).toEqual([
    TokenType.Integer,
    TokenType.Integer,
    TokenType.Operator,
  ]);
  expect(tokens[1]).toEqual({
    type: TokenType.Integer,
    value: 20,
    offset: ByteOffset.of(10),
  });
  expect(tokens[2]).toEqual(Operator.of("m", ByteOffset.of(13)));
  expect(tokens[3]).toEqual({
    type: TokenType.EOF,
    value: null,
    offset: ByteOffset.of(14),
  });
});

test("CRLF終端のコメントはLF終端より1バイト多く進んだByteOffsetになる", () => {
  // "10 % xxx\r\n 20 m" = 15 bytes / CRLF は 2 bytes 消費するため LF 版 +1
  const tokenizer = new ContentStreamTokenizer(encode("10 % xxx\r\n 20 m"));

  const result = tokenizer.tokenize();
  assert(result.ok);
  const tokens = result.value;

  expect(tokenTypesWithoutEof(tokens)).toEqual([
    TokenType.Integer,
    TokenType.Integer,
    TokenType.Operator,
  ]);
  expect(tokens[1]).toEqual({
    type: TokenType.Integer,
    value: 20,
    offset: ByteOffset.of(11),
  });
  expect(tokens[2]).toEqual(Operator.of("m", ByteOffset.of(14)));
  expect(tokens[3]).toEqual({
    type: TokenType.EOF,
    value: null,
    offset: ByteOffset.of(15),
  });
});

test("コメント本文のdelimiterをトークン化せず丸ごと破棄する", () => {
  // "10 % ( ) < > [ ] /\n 20 m" = 24 bytes / 20 は index 20 / m は index 23
  const tokenizer = new ContentStreamTokenizer(
    encode("10 % ( ) < > [ ] /\n 20 m"),
  );

  const result = tokenizer.tokenize();
  assert(result.ok);
  const tokens = result.value;

  expect(tokenTypesWithoutEof(tokens)).toEqual([
    TokenType.Integer,
    TokenType.Integer,
    TokenType.Operator,
  ]);
  expect(tokens[1]).toEqual({
    type: TokenType.Integer,
    value: 20,
    offset: ByteOffset.of(20),
  });
  expect(tokens[2]).toEqual(Operator.of("m", ByteOffset.of(23)));
  expect(tokens[3]).toEqual({
    type: TokenType.EOF,
    value: null,
    offset: ByteOffset.of(24),
  });
});

test("改行なしでEOFに達するコメントはdata長のEOF tokenで終わる", () => {
  // "10 20 m % trailing" = 18 bytes / EOF offset は data.length と一致する
  const tokenizer = new ContentStreamTokenizer(encode("10 20 m % trailing"));

  const result = tokenizer.tokenize();
  assert(result.ok);
  const tokens = result.value;

  expect(tokenTypesWithoutEof(tokens)).toEqual([
    TokenType.Integer,
    TokenType.Integer,
    TokenType.Operator,
  ]);
  expect(tokens[2]).toEqual(Operator.of("m", ByteOffset.of(6)));
  expect(tokens[3]).toEqual({
    type: TokenType.EOF,
    value: null,
    offset: ByteOffset.of(18),
  });
});

test("nextTokenでもコメントを跨いだ後のByteOffsetが正しい", () => {
  // "10 % xxx\n 20 m" を 1 token ずつ読む
  const tokenizer = new ContentStreamTokenizer(encode("10 % xxx\n 20 m"));

  const first = tokenizer.nextToken();
  const second = tokenizer.nextToken();
  const third = tokenizer.nextToken();
  const fourth = tokenizer.nextToken();

  assert(first.ok);
  assert(second.ok);
  assert(third.ok);
  assert(fourth.ok);
  expect(first.value).toEqual({
    type: TokenType.Integer,
    value: 10,
    offset: ByteOffset.of(0),
  });
  expect(second.value).toEqual({
    type: TokenType.Integer,
    value: 20,
    offset: ByteOffset.of(10),
  });
  expect(third.value).toEqual(Operator.of("m", ByteOffset.of(13)));
  expect(fourth.value).toEqual({
    type: TokenType.EOF,
    value: null,
    offset: ByteOffset.of(14),
  });
});

test("リテラル文字列内の%はコメント開始として扱わない", () => {
  // "(50% off) Tj" = 12 bytes / Tj は index 10
  const tokenizer = new ContentStreamTokenizer(encode("(50% off) Tj"));

  const result = tokenizer.tokenize();
  assert(result.ok);
  const tokens = result.value;

  expect(tokenTypesWithoutEof(tokens)).toEqual([
    TokenType.LiteralString,
    TokenType.Operator,
  ]);
  expect(tokens[0]).toEqual({
    type: TokenType.LiteralString,
    value: "50% off",
    offset: ByteOffset.of(0),
  });
  expect(tokens[1]).toEqual(Operator.of("Tj", ByteOffset.of(10)));
  expect(tokens[2]).toEqual({
    type: TokenType.EOF,
    value: null,
    offset: ByteOffset.of(12),
  });
});

test("空白を挟まない%も数値の直後でコメント開始として扱う", () => {
  // "10% xxx\n 20 m" = 13 bytes / % が delimiter なので 10 で数値が切れる
  const tokenizer = new ContentStreamTokenizer(encode("10% xxx\n 20 m"));

  const result = tokenizer.tokenize();
  assert(result.ok);
  const tokens = result.value;

  expect(tokenTypesWithoutEof(tokens)).toEqual([
    TokenType.Integer,
    TokenType.Integer,
    TokenType.Operator,
  ]);
  expect(tokens[0]).toEqual({
    type: TokenType.Integer,
    value: 10,
    offset: ByteOffset.of(0),
  });
  expect(tokens[1]).toEqual({
    type: TokenType.Integer,
    value: 20,
    offset: ByteOffset.of(9),
  });
  expect(tokens[2]).toEqual(Operator.of("m", ByteOffset.of(12)));
  expect(tokens[3]).toEqual({
    type: TokenType.EOF,
    value: null,
    offset: ByteOffset.of(13),
  });
});

test("本文が空のコメントをスキップする", () => {
  // "10 %\n 20 m" = 10 bytes / % の直後が即 EOL（本文長 0）
  const tokenizer = new ContentStreamTokenizer(encode("10 %\n 20 m"));

  const result = tokenizer.tokenize();
  assert(result.ok);
  const tokens = result.value;

  expect(tokenTypesWithoutEof(tokens)).toEqual([
    TokenType.Integer,
    TokenType.Integer,
    TokenType.Operator,
  ]);
  expect(tokens[1]).toEqual({
    type: TokenType.Integer,
    value: 20,
    offset: ByteOffset.of(6),
  });
  expect(tokens[2]).toEqual(Operator.of("m", ByteOffset.of(9)));
  expect(tokens[3]).toEqual({
    type: TokenType.EOF,
    value: null,
    offset: ByteOffset.of(10),
  });
});

test("最終バイトが%だけの入力でもEOF tokenで終わる", () => {
  // "10 20 m %" = 9 bytes / % が最終バイト（コメント本文が存在しない）
  const tokenizer = new ContentStreamTokenizer(encode("10 20 m %"));

  const result = tokenizer.tokenize();
  assert(result.ok);
  const tokens = result.value;

  expect(tokenTypesWithoutEof(tokens)).toEqual([
    TokenType.Integer,
    TokenType.Integer,
    TokenType.Operator,
  ]);
  expect(tokens[2]).toEqual(Operator.of("m", ByteOffset.of(6)));
  expect(tokens[3]).toEqual({
    type: TokenType.EOF,
    value: null,
    offset: ByteOffset.of(9),
  });
});

test("連続するコメント行をまとめてスキップする", () => {
  // "10 % a\n% b\n 20 m" = 16 bytes / コメント分岐を 2 周する
  const tokenizer = new ContentStreamTokenizer(encode("10 % a\n% b\n 20 m"));

  const result = tokenizer.tokenize();
  assert(result.ok);
  const tokens = result.value;

  expect(tokenTypesWithoutEof(tokens)).toEqual([
    TokenType.Integer,
    TokenType.Integer,
    TokenType.Operator,
  ]);
  expect(tokens[1]).toEqual({
    type: TokenType.Integer,
    value: 20,
    offset: ByteOffset.of(12),
  });
  expect(tokens[2]).toEqual(Operator.of("m", ByteOffset.of(15)));
  expect(tokens[3]).toEqual({
    type: TokenType.EOF,
    value: null,
    offset: ByteOffset.of(16),
  });
});

test("ストリーム先頭のコメントをスキップし最初のtokenのByteOffsetが0にならない", () => {
  // "% header\n10 20 m" = 16 bytes / 最初の Integer は index 9 から始まる
  const tokenizer = new ContentStreamTokenizer(encode("% header\n10 20 m"));

  const result = tokenizer.tokenize();
  assert(result.ok);
  const tokens = result.value;

  expect(tokenTypesWithoutEof(tokens)).toEqual([
    TokenType.Integer,
    TokenType.Integer,
    TokenType.Operator,
  ]);
  expect(tokens[0]).toEqual({
    type: TokenType.Integer,
    value: 10,
    offset: ByteOffset.of(9),
  });
  expect(tokens[1]).toEqual({
    type: TokenType.Integer,
    value: 20,
    offset: ByteOffset.of(12),
  });
  expect(tokens[2]).toEqual(Operator.of("m", ByteOffset.of(15)));
  expect(tokens[3]).toEqual({
    type: TokenType.EOF,
    value: null,
    offset: ByteOffset.of(16),
  });
});

test("配列オペランド内のコメントをスキップしTJだけをOperatorに変換する", () => {
  // "[ 1 % c\n 2 ] TJ" = 15 bytes / ] は index 11 / TJ は index 13
  const tokenizer = new ContentStreamTokenizer(encode("[ 1 % c\n 2 ] TJ"));

  const result = tokenizer.tokenize();
  assert(result.ok);
  const tokens = result.value;

  expect(tokenTypesWithoutEof(tokens)).toEqual([
    TokenType.ArrayBegin,
    TokenType.Integer,
    TokenType.Integer,
    TokenType.ArrayEnd,
    TokenType.Operator,
  ]);
  expect(tokens[2]).toEqual({
    type: TokenType.Integer,
    value: 2,
    offset: ByteOffset.of(9),
  });
  expect(tokens[3]).toEqual({
    type: TokenType.ArrayEnd,
    value: "]",
    offset: ByteOffset.of(11),
  });
  expect(tokens[4]).toEqual(Operator.of("TJ", ByteOffset.of(13)));
  expect(tokens[5]).toEqual({
    type: TokenType.EOF,
    value: null,
    offset: ByteOffset.of(15),
  });
});

test("辞書オペランド内のコメントをスキップしBDCだけをOperatorに変換する", () => {
  // "<< /A 1 % c\n >> BDC" = 19 bytes / >> は index 13 / BDC は index 16
  const tokenizer = new ContentStreamTokenizer(encode("<< /A 1 % c\n >> BDC"));

  const result = tokenizer.tokenize();
  assert(result.ok);
  const tokens = result.value;

  expect(tokenTypesWithoutEof(tokens)).toEqual([
    TokenType.DictBegin,
    TokenType.Name,
    TokenType.Integer,
    TokenType.DictEnd,
    TokenType.Operator,
  ]);
  expect(tokens[2]).toEqual({
    type: TokenType.Integer,
    value: 1,
    offset: ByteOffset.of(6),
  });
  expect(tokens[3]).toEqual({
    type: TokenType.DictEnd,
    value: ">>",
    offset: ByteOffset.of(13),
  });
  expect(tokens[4]).toEqual(Operator.of("BDC", ByteOffset.of(16)));
  expect(tokens[5]).toEqual({
    type: TokenType.EOF,
    value: null,
    offset: ByteOffset.of(19),
  });
});
