import { assert, expect, test } from "vitest";
import type { Token, TokenArrayBegin } from "../../../../pdf/index";
import { TokenType } from "../../../../pdf/index";
import { ContentStreamTokenizer } from "../../../tokenizer/index";
import { readArrayOperand } from "../index";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

function setupAfterArrayBegin(stream: string): {
  tokenizer: ContentStreamTokenizer;
  openToken: TokenArrayBegin;
  positionOf: (substr: string) => number;
} {
  const tokenizer = new ContentStreamTokenizer(encode(stream));
  const result = tokenizer.nextToken();
  assert(result.ok);
  const token: Token = result.value;
  assert(token.type === TokenType.ArrayBegin);
  return {
    tokenizer,
    openToken: token,
    positionOf: (substr: string) => stream.indexOf(substr),
  };
}

test("`[1 2` で EOF に到達すると OBJECT_PARSE_UNTERMINATED を返し offset が `[` の位置と一致する", () => {
  const stream = "[1 2";
  const { tokenizer, openToken, positionOf } = setupAfterArrayBegin(stream);

  const result = readArrayOperand(tokenizer, openToken);

  assert(!result.ok);
  assert(result.error.code === "OBJECT_PARSE_UNTERMINATED");
  expect(result.error.offset).toBe(positionOf("["));
});

// 変換不能 token を defensive で拒否する経路の代表例（Keyword / InlineImage も同じ分岐に集約される）
test("`[1 BT 2]` の `BT` を検出すると OBJECT_PARSE_UNEXPECTED_TOKEN を返し offset が `BT` の位置と一致する", () => {
  const stream = "[1 BT 2]";
  const { tokenizer, openToken, positionOf } = setupAfterArrayBegin(stream);

  const result = readArrayOperand(tokenizer, openToken);

  assert(!result.ok);
  assert(result.error.code === "OBJECT_PARSE_UNEXPECTED_TOKEN");
  expect(result.error.offset).toBe(positionOf("BT"));
});

test("`[<< /K /V >>]` の `<<` を検出すると OBJECT_PARSE_UNEXPECTED_TOKEN を返し offset が `<<` の位置と一致する", () => {
  const stream = "[<< /K /V >>]";
  const { tokenizer, openToken, positionOf } = setupAfterArrayBegin(stream);

  const result = readArrayOperand(tokenizer, openToken);

  assert(!result.ok);
  assert(result.error.code === "OBJECT_PARSE_UNEXPECTED_TOKEN");
  expect(result.error.offset).toBe(positionOf("<<"));
});

test("`[1 >> 2]` の `>>` を検出すると OBJECT_PARSE_UNEXPECTED_TOKEN を返し offset が `>>` の位置と一致する", () => {
  const stream = "[1 >> 2]";
  const { tokenizer, openToken, positionOf } = setupAfterArrayBegin(stream);

  const result = readArrayOperand(tokenizer, openToken);

  assert(!result.ok);
  assert(result.error.code === "OBJECT_PARSE_UNEXPECTED_TOKEN");
  expect(result.error.offset).toBe(positionOf(">>"));
});

test("`[ . ]` (NaN real) で OBJECT_PARSE_UNEXPECTED_TOKEN を返す (toPrimitivePdfValue 由来)", () => {
  const { tokenizer, openToken } = setupAfterArrayBegin("[ . ]");

  const result = readArrayOperand(tokenizer, openToken);

  assert(!result.ok);
  assert(result.error.code === "OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("ネスト深さ 101 段の配列で NESTING_TOO_DEEP を返す", () => {
  const opens = "[".repeat(101);
  const closes = "]".repeat(101);
  const stream = `${opens}1${closes}`;
  const { tokenizer, openToken } = setupAfterArrayBegin(stream);

  const result = readArrayOperand(tokenizer, openToken);

  assert(!result.ok);
  assert(result.error.code === "NESTING_TOO_DEEP");
  expect(result.error.offset).toBe(100);
});
