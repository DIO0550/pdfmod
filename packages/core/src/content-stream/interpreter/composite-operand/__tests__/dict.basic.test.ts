import { assert, expect, test } from "vitest";
import type { PdfValue, Token, TokenDictBegin } from "../../../../pdf/index";
import { TokenType } from "../../../../pdf/index";
import { ContentStreamTokenizer } from "../../../tokenizer/index";
import { readDictOperand } from "../index";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

/**
 * stream 文字列を tokenize して最初の `DictBegin` token を取り出し、
 * その後の呼び出しから読み取りを開始できる状態の tokenizer を返すヘルパ。
 * `readDictOperand` の呼び出し前提を再現する。
 */
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

test("`<<>>` を読み取り entries が空の PdfDictionary を返す", () => {
  const { tokenizer, openToken } = setupAfterDictBegin("<<>>");

  const result = readDictOperand(tokenizer, openToken);

  assert(result.ok);
  expect(result.value).toEqual({ type: "dictionary", entries: new Map() });
});

test("`<</K /V>>` を読み取り entries.get(`K`) が Name `V` の PdfDictionary を返す", () => {
  const { tokenizer, openToken } = setupAfterDictBegin("<</K /V>>");

  const result = readDictOperand(tokenizer, openToken);

  assert(result.ok);
  expect(result.value).toEqual({
    type: "dictionary",
    entries: new Map([["K", { type: "name", value: "V" }]]),
  });
});

test("`<</A 1 /B 2>>` を読み取り 2 件の entries を含む PdfDictionary を返す", () => {
  const { tokenizer, openToken } = setupAfterDictBegin("<</A 1 /B 2>>");

  const result = readDictOperand(tokenizer, openToken);

  assert(result.ok);
  expect(result.value).toEqual({
    type: "dictionary",
    entries: new Map<string, PdfValue>([
      ["A", { type: "integer", value: 1 }],
      ["B", { type: "integer", value: 2 }],
    ]),
  });
});

test.each<{ label: string; stream: string; expected: PdfValue }>([
  {
    label: "Boolean true",
    stream: "<</K true>>",
    expected: { type: "boolean", value: true },
  },
  {
    label: "Integer 42",
    stream: "<</K 42>>",
    expected: { type: "integer", value: 42 },
  },
  {
    label: "Real 1.5",
    stream: "<</K 1.5>>",
    expected: { type: "real", value: 1.5 },
  },
  {
    label: "LiteralString (hello)",
    stream: "<</K (hello)>>",
    expected: { type: "string", value: encode("hello"), encoding: "literal" },
  },
  {
    label: "HexString <41>",
    stream: "<</K <41>>>",
    expected: {
      type: "string",
      value: new Uint8Array([0x41]),
      encoding: "hex",
    },
  },
  {
    label: "Name /Inner",
    stream: "<</K /Inner>>",
    expected: { type: "name", value: "Inner" },
  },
  {
    label: "Null null",
    stream: "<</K null>>",
    expected: { type: "null" },
  },
])(
  "`$stream` を読み取り entries.get(`K`) が $label の PdfValue となる",
  ({ stream, expected }) => {
    const { tokenizer, openToken } = setupAfterDictBegin(stream);

    const result = readDictOperand(tokenizer, openToken);

    assert(result.ok);
    expect(result.value.entries.get("K")).toEqual(expected);
  },
);
