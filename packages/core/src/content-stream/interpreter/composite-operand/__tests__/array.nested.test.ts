import { assert, expect, test } from "vitest";
import type { Token, TokenArrayBegin } from "../../../../pdf/index";
import { TokenType } from "../../../../pdf/index";
import { ContentStreamTokenizer } from "../../../tokenizer/index";
import { readArrayOperand } from "../index";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

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

test("`[[1 2]]` を読み取り elements[0] が integer 2 要素の PdfArray となる", () => {
  const { tokenizer, openToken } = setupAfterArrayBegin("[[1 2]]");

  const result = readArrayOperand(tokenizer, openToken);

  assert(result.ok);
  expect(result.value).toEqual({
    type: "array",
    elements: [
      {
        type: "array",
        elements: [
          { type: "integer", value: 1 },
          { type: "integer", value: 2 },
        ],
      },
    ],
  });
});

test("`[[1 2] [3 4]]` を読み取り PdfArray を 2 件含む PdfArray を返す", () => {
  const { tokenizer, openToken } = setupAfterArrayBegin("[[1 2] [3 4]]");

  const result = readArrayOperand(tokenizer, openToken);

  assert(result.ok);
  expect(result.value).toEqual({
    type: "array",
    elements: [
      {
        type: "array",
        elements: [
          { type: "integer", value: 1 },
          { type: "integer", value: 2 },
        ],
      },
      {
        type: "array",
        elements: [
          { type: "integer", value: 3 },
          { type: "integer", value: 4 },
        ],
      },
    ],
  });
});

test("`[[[1]]]` を読み取り 3 段にネストした PdfArray 構造を返す", () => {
  const { tokenizer, openToken } = setupAfterArrayBegin("[[[1]]]");

  const result = readArrayOperand(tokenizer, openToken);

  assert(result.ok);
  expect(result.value).toEqual({
    type: "array",
    elements: [
      {
        type: "array",
        elements: [
          {
            type: "array",
            elements: [{ type: "integer", value: 1 }],
          },
        ],
      },
    ],
  });
});

test("`[1 [2 3] 4]` を読み取り integer・ネスト PdfArray・integer の順を保つ", () => {
  const { tokenizer, openToken } = setupAfterArrayBegin("[1 [2 3] 4]");

  const result = readArrayOperand(tokenizer, openToken);

  assert(result.ok);
  expect(result.value).toEqual({
    type: "array",
    elements: [
      { type: "integer", value: 1 },
      {
        type: "array",
        elements: [
          { type: "integer", value: 2 },
          { type: "integer", value: 3 },
        ],
      },
      { type: "integer", value: 4 },
    ],
  });
});

test("`[[]]` を読み取り elements[0] が空 PdfArray となる", () => {
  const { tokenizer, openToken } = setupAfterArrayBegin("[[]]");

  const result = readArrayOperand(tokenizer, openToken);

  assert(result.ok);
  expect(result.value).toEqual({
    type: "array",
    elements: [{ type: "array", elements: [] }],
  });
});

test("ネスト深さ 100 の配列を読み取り成功する (MAX_NESTING_DEPTH 直下)", () => {
  const opens = "[".repeat(100);
  const closes = "]".repeat(100);
  const stream = `${opens}1${closes}`;
  const { tokenizer, openToken } = setupAfterArrayBegin(stream);

  const result = readArrayOperand(tokenizer, openToken);

  assert(result.ok);

  let level: unknown = result.value;
  for (let i = 0; i < 100; i++) {
    assert(typeof level === "object" && level !== null);
    const arr = level as { type: string; elements: unknown[] };
    expect(arr.type).toBe("array");
    expect(arr.elements.length).toBe(1);
    level = arr.elements[0];
  }
  expect(level).toEqual({ type: "integer", value: 1 });
});
