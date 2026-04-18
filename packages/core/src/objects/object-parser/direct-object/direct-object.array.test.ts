import { assert, expect, test } from "vitest";
import { Tokenizer } from "../../../lexer/tokenizer/index";
import { ByteOffset } from "../../../pdf/types/byte-offset/index";
import type { PdfValue } from "../../../pdf/types/pdf-types/index";
import { BufferedTokenizer } from "../buffered-tokenizer/index";
import { DirectObject } from "./index";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const btOf = (s: string): BufferedTokenizer =>
  new BufferedTokenizer(new Tokenizer(enc(s)));

test("空配列 [] に対して空の elements を返す", () => {
  const result = DirectObject.parse(btOf("[]"), ByteOffset.of(0), 0);
  assert(result.ok);
  expect(result.value).toEqual({ type: "array", elements: [] });
});

test("要素あり配列は各要素をパースした elements を返す", () => {
  const result = DirectObject.parse(btOf("[1 2 3]"), ByteOffset.of(0), 0);
  assert(result.ok);
  const arr = result.value as { type: "array"; elements: PdfValue[] };
  expect(arr.elements).toHaveLength(3);
});

test("ネスト配列は再帰的にパースされた elements を返す", () => {
  const result = DirectObject.parse(btOf("[[1] [2]]"), ByteOffset.of(0), 0);
  assert(result.ok);
  const arr = result.value as { type: "array"; elements: PdfValue[] };
  expect(arr.elements).toHaveLength(2);
});

test("ネスト深度超過で NESTING_TOO_DEEP エラー", () => {
  const input = "[".repeat(101) + "]".repeat(101);
  const result = DirectObject.parse(btOf(input), ByteOffset.of(0), 0);
  assert(!result.ok);
  expect(result.error.code).toBe("NESTING_TOO_DEEP");
});

test("閉じ括弧なしで OBJECT_PARSE_UNTERMINATED エラー", () => {
  const result = DirectObject.parse(btOf("[1 2"), ByteOffset.of(0), 0);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNTERMINATED");
});
