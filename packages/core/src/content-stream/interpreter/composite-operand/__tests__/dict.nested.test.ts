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

test("`<</A [1 2]>>` を読み取り entries.get(`A`) が PdfArray となる (dict→array 経路)", () => {
  const { tokenizer, openToken } = setupAfterDictBegin("<</A [1 2]>>");

  const result = readDictOperand(tokenizer, openToken);

  assert(result.ok);
  expect(result.value.entries.get("A")).toEqual({
    type: "array",
    elements: [
      { type: "integer", value: 1 },
      { type: "integer", value: 2 },
    ],
  });
});

test("`<</A <</B 1>>>>` を読み取り 1 段ネスト辞書を受理する (dict→dict 自己再帰)", () => {
  const { tokenizer, openToken } = setupAfterDictBegin("<</A <</B 1>>>>");

  const result = readDictOperand(tokenizer, openToken);

  assert(result.ok);
  expect(result.value).toEqual({
    type: "dictionary",
    entries: new Map([
      [
        "A",
        {
          type: "dictionary",
          entries: new Map([["B", { type: "integer", value: 1 }]]),
        },
      ],
    ]),
  });
});

test("`<</A <</B [1 2]>>>>` を読み取り 辞書→辞書→配列の経路を受理する", () => {
  const { tokenizer, openToken } = setupAfterDictBegin("<</A <</B [1 2]>>>>");

  const result = readDictOperand(tokenizer, openToken);

  assert(result.ok);
  const a = result.value.entries.get("A");
  assert(a !== undefined && a.type === "dictionary");
  const b = a.entries.get("B");
  expect(b).toEqual({
    type: "array",
    elements: [
      { type: "integer", value: 1 },
      { type: "integer", value: 2 },
    ],
  });
});

test("`<</A [<</K 1>>]>>` を読み取り 辞書→配列→辞書の経路を受理する", () => {
  const { tokenizer, openToken } = setupAfterDictBegin("<</A [<</K 1>>]>>");

  const result = readDictOperand(tokenizer, openToken);

  assert(result.ok);
  expect(result.value).toEqual({
    type: "dictionary",
    entries: new Map([
      [
        "A",
        {
          type: "array",
          elements: [
            {
              type: "dictionary",
              entries: new Map([["K", { type: "integer", value: 1 }]]),
            },
          ],
        },
      ],
    ]),
  });
});
