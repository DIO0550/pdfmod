import { assert, expect, test } from "vitest";
import type { Token, TokenDictBegin } from "../../../../pdf/index";
import { TokenType } from "../../../../pdf/index";
import { ContentStreamTokenizer } from "../../../tokenizer/index";
import { readDictOperand } from "../index";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

function setupAfterDictBegin(stream: string): {
  tokenizer: ContentStreamTokenizer;
  openToken: TokenDictBegin;
  positionOf: (substr: string) => number;
} {
  const tokenizer = new ContentStreamTokenizer(encode(stream));
  const result = tokenizer.nextToken();
  assert(result.ok);
  const token: Token = result.value;
  assert(token.type === TokenType.DictBegin);
  return {
    tokenizer,
    openToken: token,
    positionOf: (substr: string) => stream.indexOf(substr),
  };
}

test("`<<` 単独で EOF に達すると OBJECT_PARSE_UNTERMINATED を返し offset が `<<` の位置と一致する", () => {
  const stream = "<<";
  const { tokenizer, openToken, positionOf } = setupAfterDictBegin(stream);

  const result = readDictOperand(tokenizer, openToken);

  assert(!result.ok);
  assert(result.error.code === "OBJECT_PARSE_UNTERMINATED");
  expect(result.error.offset).toBe(positionOf("<<"));
});

test("`<</K` で value 位置に達する前に EOF となると OBJECT_PARSE_UNTERMINATED を返し offset が `<<` の位置と一致する", () => {
  const stream = "<</K";
  const { tokenizer, openToken, positionOf } = setupAfterDictBegin(stream);

  const result = readDictOperand(tokenizer, openToken);

  assert(!result.ok);
  assert(result.error.code === "OBJECT_PARSE_UNTERMINATED");
  expect(result.error.offset).toBe(positionOf("<<"));
});

test.each<{ label: string; stream: string; badToken: string }>([
  { label: "Integer", stream: "<<1 2>>", badToken: "1" },
  { label: "Real", stream: "<<1.5 2>>", badToken: "1.5" },
  { label: "Boolean", stream: "<<true 2>>", badToken: "true" },
  { label: "Null", stream: "<<null 2>>", badToken: "null" },
  { label: "LiteralString", stream: "<<(x) 2>>", badToken: "(x)" },
  { label: "HexString", stream: "<<<41> 2>>", badToken: "<41>" },
  { label: "Operator", stream: "<<BT 2>>", badToken: "BT" },
  { label: "ArrayBegin", stream: "<<[ ] 2>>", badToken: "[" },
  { label: "DictBegin", stream: "<<<</K /V>> 2>>", badToken: "<</K" },
  { label: "ArrayEnd", stream: "<<] 2>>", badToken: "]" },
  {
    label: "InlineImage",
    stream: "<<BI /W 1 /H 1 /CS /G /BPC 8 ID @ EI /K 2>>",
    badToken: "BI",
  },
])(
  "`$stream` の key 位置 $label を検出すると OBJECT_PARSE_UNEXPECTED_TOKEN を返し offset が `$badToken` の位置と一致する",
  ({ stream, badToken }) => {
    const { tokenizer, openToken, positionOf } = setupAfterDictBegin(stream);

    const result = readDictOperand(tokenizer, openToken);

    assert(!result.ok);
    assert(result.error.code === "OBJECT_PARSE_UNEXPECTED_TOKEN");
    expect(result.error.message).toMatch(/^Dictionary key must be a name, /);
    expect(result.error.offset).toBe(positionOf(badToken));
  },
);

test.each<{ label: string; stream: string; badToken: string }>([
  { label: "Operator (BT)", stream: "<</K BT>>", badToken: "BT" },
  { label: "ArrayEnd", stream: "<</K ]>>", badToken: "]" },
  { label: "DictEnd (単独 >>)", stream: "<</K >> /K2 1>>", badToken: ">>" },
  {
    label: "InlineImage",
    stream: "<</K BI /W 1 /H 1 /CS /G /BPC 8 ID @ EI>>",
    badToken: "BI",
  },
  { label: "Operator (endobj)", stream: "<</K endobj>>", badToken: "endobj" },
])(
  "`$stream` の value 位置 $label を検出すると OBJECT_PARSE_UNEXPECTED_TOKEN を返し offset が `$badToken` の位置と一致する",
  ({ stream, badToken }) => {
    const { tokenizer, openToken, positionOf } = setupAfterDictBegin(stream);

    const result = readDictOperand(tokenizer, openToken);

    assert(!result.ok);
    assert(result.error.code === "OBJECT_PARSE_UNEXPECTED_TOKEN");
    expect(result.error.message).toMatch(/^Unexpected token in dictionary value: /);
    expect(result.error.offset).toBe(positionOf(badToken));
  },
);

// 純 dict ネストを 101 段組み立てて MAX_NESTING_DEPTH = 100 の境界を検証する。
// 上限を超えるのは内側 (101 段目) の `<<` であり、最外ではないことを offset で示す。
test("`<</K <</K <</K ...>>>>` 形式で 101 段ネストすると NESTING_TOO_DEEP を返し offset が 101 段目の `<<` 位置と一致する", () => {
  const depth = 101;
  // 1 段目は最外 `<<` で、2..101 段目は `/K << ` を内側に挟む。
  // 1 段あたり 5 文字 (`/K << ` のうちトレーリング space を除いて 5 文字)。
  const inners = "/K <<".repeat(depth - 1);
  const closes = ">>".repeat(depth);
  const stream = `<<${inners}${closes}`;
  const { tokenizer, openToken } = setupAfterDictBegin(stream);

  const result = readDictOperand(tokenizer, openToken);

  assert(!result.ok);
  assert(result.error.code === "NESTING_TOO_DEEP");
  // 101 段目の `<<` 位置 = `<<` + `/K << ` × 100 のうち最後の `<<` 開始。
  // 計算: 最外 `<<` 2 文字 + 100 段分の `/K <<` (各 5 文字) = 2 + 500 = 502 のうち、
  // 100 段目の `/K <<` 内の `<<` は 2 + 5 × 99 + 3 = 500 から始まる。
  // → 100 段目を「内側に入る最後の <<」とした場合、その offset は stream.lastIndexOf("<<") で得られる。
  expect(result.error.offset).toBe(stream.lastIndexOf("<<"));
});

// array/dict 交互ネストでの共有 depth 増分を pin down する。
// 構造: 最外 `<<` (depth 1) + `/K [<<` × 50 (各 pair で array→dict と 2 段深くなる)。
// 50 pair で depth = 1 + 2×50 = 101、101 段目の `<<` が NESTING_TOO_DEEP を発火する。
test("`<</K [<</K [<</K ...>>]>>]>>` 形式で array/dict 交互 101 段ネストすると NESTING_TOO_DEEP を返す", () => {
  const pairs = 50;
  const inners = "/K [<<".repeat(pairs);
  const closes = ">>]".repeat(pairs);
  const stream = `<<${inners}${closes}>>`;
  const { tokenizer, openToken } = setupAfterDictBegin(stream);

  const result = readDictOperand(tokenizer, openToken);

  assert(!result.ok);
  assert(result.error.code === "NESTING_TOO_DEEP");
  // 101 段目の token は最後 (50 番目) の pair 内の `<<`、すなわち最終位置の `<<`。
  expect(result.error.offset).toBe(stream.lastIndexOf("<<"));
});
