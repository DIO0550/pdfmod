import { assert, expect, test } from "vitest";
import { ByteOffset, Operator, TokenType } from "../../../../pdf/index";
import { ContentStreamTokenizer } from "../../index";

const encode = (input: string): Uint8Array => new TextEncoder().encode(input);
const decode = (input: Uint8Array): string => new TextDecoder().decode(input);

test("inline imageを1つのtokenとして返す", () => {
  const tokenizer = new ContentStreamTokenizer(
    encode("BI /W 1 /H 1 /CS /RGB /BPC 8 ID abc EI"),
  );

  const result = tokenizer.nextToken();

  assert(result.ok);
  expect(result.value.type).toBe(TokenType.InlineImage);
});

test("inline image辞書のkey/value pairを順序保持する", () => {
  const tokenizer = new ContentStreamTokenizer(
    encode("BI /W 1 /H 2 /CS /RGB /BPC 8 ID abc EI"),
  );

  const result = tokenizer.nextToken();

  assert(result.ok);
  assert(result.value.type === TokenType.InlineImage);
  expect(
    result.value.dict.map((entry) => [entry.key.value, entry.value[0]?.type]),
  ).toEqual([
    ["W", TokenType.Integer],
    ["H", TokenType.Integer],
    ["CS", TokenType.Name],
    ["BPC", TokenType.Integer],
  ]);
});

test("inline image辞書の配列valueを1つのvalue token sequenceとして保持する", () => {
  const tokenizer = new ContentStreamTokenizer(
    encode("BI /Decode [0 1] /W 1 ID abc EI"),
  );

  const result = tokenizer.nextToken();

  assert(result.ok);
  assert(result.value.type === TokenType.InlineImage);
  expect(
    result.value.dict.map((entry) => [
      entry.key.value,
      entry.value.map((token) => token.type),
    ]),
  ).toEqual([
    [
      "Decode",
      [
        TokenType.ArrayBegin,
        TokenType.Integer,
        TokenType.Integer,
        TokenType.ArrayEnd,
      ],
    ],
    ["W", [TokenType.Integer]],
  ]);
});

test("inline image辞書の辞書valueを1つのvalue token sequenceとして保持する", () => {
  const tokenizer = new ContentStreamTokenizer(
    encode("BI /DP << /Predictor 12 >> /W 1 ID abc EI"),
  );

  const result = tokenizer.nextToken();

  assert(result.ok);
  assert(result.value.type === TokenType.InlineImage);
  expect(
    result.value.dict.map((entry) => [
      entry.key.value,
      entry.value.map((token) => token.type),
    ]),
  ).toEqual([
    [
      "DP",
      [
        TokenType.DictBegin,
        TokenType.Name,
        TokenType.Integer,
        TokenType.DictEnd,
      ],
    ],
    ["W", [TokenType.Integer]],
  ]);
});

test("inline imageはdata bytesとBI offsetを保持する", () => {
  const tokenizer = new ContentStreamTokenizer(encode("q BI /W 1 ID abc EI"));

  const first = tokenizer.nextToken();
  const second = tokenizer.nextToken();

  assert(first.ok);
  assert(second.ok);
  expect(first.value).toEqual(Operator.of("q", ByteOffset.of(0)));
  assert(second.value.type === TokenType.InlineImage);
  expect(second.value.offset).toBe(ByteOffset.of(2));
  expect(decode(second.value.data)).toBe("abc");
});

test.each([
  ["LF", "\n", "abc"],
  ["CR", "\r", "abc"],
  ["CRLF", "\r\n", "abc"],
  ["space", " ", "abc"],
  ["空白なし", "", "abc"],
])("ID直後の%sをdataから除外する", (_label, separator, expected) => {
  const tokenizer = new ContentStreamTokenizer(
    encode(`BI /W 1 ID${separator}${expected} EI`),
  );

  const result = tokenizer.nextToken();

  assert(result.ok);
  assert(result.value.type === TokenType.InlineImage);
  expect(decode(result.value.data)).toBe(expected);
});

test.each([
  ["abcEIdef", "BI /W 1 ID abcEIdef EI"],
  ["abc EI-like", "BI /W 1 ID abc EI-like EI"],
])("%sはinline image終端扱いしない", (_label, input) => {
  const tokenizer = new ContentStreamTokenizer(encode(input));

  const result = tokenizer.nextToken();

  assert(result.ok);
  assert(result.value.type === TokenType.InlineImage);
  expect(decode(result.value.data)).toContain(_label);
});

test("EI直前のCRLFをdataから除外する", () => {
  const tokenizer = new ContentStreamTokenizer(encode("BI /W 1 ID abc\r\nEI"));

  const result = tokenizer.nextToken();

  assert(result.ok);
  assert(result.value.type === TokenType.InlineImage);
  expect(decode(result.value.data)).toBe("abc");
});

test("EI後の次tokenを正しいoffsetで読み取る", () => {
  const tokenizer = new ContentStreamTokenizer(encode("q BI /W 1 ID abc EI Q"));

  const tokens = tokenizer.tokenize();

  assert(tokens.ok);
  expect(tokens.value).toMatchObject([
    Operator.of("q", ByteOffset.of(0)),
    { type: TokenType.InlineImage, offset: ByteOffset.of(2) },
    Operator.of("Q", ByteOffset.of(20)),
    { type: TokenType.EOF, value: null, offset: ByteOffset.of(21) },
  ]);
});

test.each([
  ["ID欠損", "BI /W 1 EI", ByteOffset.of(8)],
  ["BI直後EOF", "BI", ByteOffset.of(2)],
  ["compound value未終端(配列)", "BI /Decode [0 1", ByteOffset.of(15)],
  ["compound value未終端(辞書)", "BI /DP << /Predictor 12", ByteOffset.of(23)],
  [
    "compound value閉じ括弧ミスマッチ(配列を辞書で閉じる)",
    "BI /Decode [0 1 >> /W 1 ID abc EI",
    ByteOffset.of(16),
  ],
  [
    "compound value閉じ括弧ミスマッチ(辞書を配列で閉じる)",
    "BI /DP << /Predictor 12 ] /W 1 ID abc EI",
    ByteOffset.of(24),
  ],
  ["EI欠損", "BI /W 1 ID abc", ByteOffset.of(14)],
  ["ID直後CRのみでEI欠損", "BI /W 1 ID\r", ByteOffset.of(11)],
  ["ID直後CRLFでEI欠損", "BI /W 1 ID\r\n", ByteOffset.of(12)],
  ["dict key不正", "BI W 1 ID abc EI", ByteOffset.of(3)],
  ["dict value欠損", "BI /W ID abc EI", ByteOffset.of(6)],
  ["dict内nested inline image", "BI /W BI ID abc EI", ByteOffset.of(6)],
])("%sはCONTENT_STREAM_INLINE_IMAGE_INVALIDを返す", (_label, input, offset) => {
  const tokenizer = new ContentStreamTokenizer(encode(input));

  const result = tokenizer.nextToken();

  assert(!result.ok);
  expect(result.error).toMatchObject({
    code: "CONTENT_STREAM_INLINE_IMAGE_INVALID",
    offset,
  });
});
