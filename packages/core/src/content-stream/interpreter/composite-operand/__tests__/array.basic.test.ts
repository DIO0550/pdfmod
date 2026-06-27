import { assert, expect, test } from "vitest";
import type { Token, TokenArrayBegin } from "../../../../pdf/index";
import { TokenType } from "../../../../pdf/index";
import { ContentStreamTokenizer } from "../../../tokenizer/index";
import { readArrayOperand } from "../index";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

/**
 * stream 文字列を tokenize して最初の `ArrayBegin` token を取り出し、
 * その後の呼び出しから読み取りを開始できる状態の tokenizer を返すヘルパ。
 * `readArrayOperand` の呼び出し前提を再現する。
 */
function setupAfterArrayBegin(stream: string): {
  tokenizer: ContentStreamTokenizer;
  openToken: TokenArrayBegin;
} {
  const tokenizer = new ContentStreamTokenizer(encode(stream));
  const result = tokenizer.nextToken();
  assert(result.ok);
  const token: Token = result.value;
  assert(token.type === TokenType.ArrayBegin);
  return { tokenizer, openToken: token };
}

test("空配列 `[]` を読み取り elements 長さ 0 の PdfArray を返す", () => {
  const { tokenizer, openToken } = setupAfterArrayBegin("[]");

  const result = readArrayOperand(tokenizer, openToken);

  assert(result.ok);
  expect(result.value).toEqual({ type: "array", elements: [] });
});

test("`[ 1 ]` を読み取り integer 1 件を含む PdfArray を返す", () => {
  const { tokenizer, openToken } = setupAfterArrayBegin("[ 1 ]");

  const result = readArrayOperand(tokenizer, openToken);

  assert(result.ok);
  expect(result.value).toEqual({
    type: "array",
    elements: [{ type: "integer", value: 1 }],
  });
});

test("`[ true false 12 -3 4.5 /Name null ]` で 7 種 primitive を順序通り含む PdfArray を返す", () => {
  const { tokenizer, openToken } = setupAfterArrayBegin(
    "[ true false 12 -3 4.5 /Name null ]",
  );

  const result = readArrayOperand(tokenizer, openToken);

  assert(result.ok);
  expect(result.value).toEqual({
    type: "array",
    elements: [
      { type: "boolean", value: true },
      { type: "boolean", value: false },
      { type: "integer", value: 12 },
      { type: "integer", value: -3 },
      { type: "real", value: 4.5 },
      { type: "name", value: "Name" },
      { type: "null" },
    ],
  });
});

test('`[ (Hello) ]` を読み取り encoding: "literal" の PdfString 1 件を含む PdfArray を返す', () => {
  const { tokenizer, openToken } = setupAfterArrayBegin("[ (Hello) ]");

  const result = readArrayOperand(tokenizer, openToken);

  assert(result.ok);
  expect(result.value).toEqual({
    type: "array",
    elements: [
      {
        type: "string",
        value: encode("Hello"),
        encoding: "literal",
      },
    ],
  });
});

test('`[ <414243> ]` を読み取り encoding: "hex" の PdfString 1 件を含む PdfArray を返す', () => {
  const { tokenizer, openToken } = setupAfterArrayBegin("[ <414243> ]");

  const result = readArrayOperand(tokenizer, openToken);

  assert(result.ok);
  expect(result.value).toEqual({
    type: "array",
    elements: [
      {
        type: "string",
        value: new Uint8Array([0x41, 0x42, 0x43]),
        encoding: "hex",
      },
    ],
  });
});

// PDF テキストオペレータ TJ の典型入力（文字列と整数の混在）が要素順を保つことを確認
test("`[ (A) 120 ]` を読み取り PdfString と PdfInteger を順序通り含む PdfArray を返す", () => {
  const { tokenizer, openToken } = setupAfterArrayBegin("[ (A) 120 ]");

  const result = readArrayOperand(tokenizer, openToken);

  assert(result.ok);
  expect(result.value).toEqual({
    type: "array",
    elements: [
      { type: "string", value: encode("A"), encoding: "literal" },
      { type: "integer", value: 120 },
    ],
  });
});
