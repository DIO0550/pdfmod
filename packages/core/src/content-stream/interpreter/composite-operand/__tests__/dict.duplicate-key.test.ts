import { assert, expect, test } from "vitest";
import type { Token, TokenDictBegin } from "../../../../pdf/index";
import { TokenType } from "../../../../pdf/index";
import { ContentStreamTokenizer } from "../../../tokenizer/index";
import { readDictOperand } from "../index";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

function setupAfterDictBegin(stream: string): {
  tokenizer: ContentStreamTokenizer;
  openToken: TokenDictBegin;
} {
  const tokenizer = new ContentStreamTokenizer(encode(stream));
  const result = tokenizer.nextToken();
  assert(result.ok);
  const token: Token = result.value;
  assert(token.type === TokenType.DictBegin);
  return { tokenizer, openToken: token };
}

// PdfDictionary.entries が Map である以上、同一 key の後勝ち（Map.set 上書き）が成立する。
// 型が ReadonlyMap 等へ変更されたら本テストが Red になり仕様を pin down できる。
test("`<</A 1 /A 2>>` を読み取り entries.get(`A`) が PdfInteger 2、entries.size が 1 となる（後勝ち）", () => {
  const { tokenizer, openToken } = setupAfterDictBegin("<</A 1 /A 2>>");

  const result = readDictOperand(tokenizer, openToken);

  assert(result.ok);
  expect(result.value.entries.size).toBe(1);
  expect(result.value.entries.get("A")).toEqual({ type: "integer", value: 2 });
});

test("`<</A 1 /B 2 /A 3>>` を読み取り entries.get(`A`) が PdfInteger 3、`B` は残り、entries.size が 2 となる", () => {
  const { tokenizer, openToken } = setupAfterDictBegin("<</A 1 /B 2 /A 3>>");

  const result = readDictOperand(tokenizer, openToken);

  assert(result.ok);
  expect(result.value.entries.size).toBe(2);
  expect(result.value.entries.get("A")).toEqual({ type: "integer", value: 3 });
  expect(result.value.entries.get("B")).toEqual({ type: "integer", value: 2 });
});
