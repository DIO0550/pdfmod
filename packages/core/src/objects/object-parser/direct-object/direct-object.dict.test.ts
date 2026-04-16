import { assert, expect, test } from "vitest";
import { Tokenizer } from "../../../lexer/tokenizer/index";
import { ByteOffset } from "../../../types/byte-offset/index";
import type { PdfDictionary } from "../../../types/pdf-types/index";
import { BufferedTokenizer } from "../buffered-tokenizer/index";
import { DirectObject } from "./index";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const btOf = (s: string): BufferedTokenizer =>
  new BufferedTokenizer(new Tokenizer(enc(s)));

test("空辞書 <<>> に対して空の entries を返す", () => {
  const result = DirectObject.parse(btOf("<<>>"), ByteOffset.of(0), 0);
  assert(result.ok);
  expect(result.value.type).toBe("dictionary");
  expect((result.value as PdfDictionary).entries.size).toBe(0);
});

test("エントリあり辞書は Name-Value ペアを entries に保持する", () => {
  const result = DirectObject.parse(
    btOf("<</Type /Page>>"),
    ByteOffset.of(0),
    0,
  );
  assert(result.ok);
  const dict = result.value as PdfDictionary;
  expect(dict.entries.get("Type")).toEqual({ type: "name", value: "Page" });
});

test("ネスト辞書は再帰的にパースされた entries を返す", () => {
  const result = DirectObject.parse(
    btOf("<</A <</B 1>>>>"),
    ByteOffset.of(0),
    0,
  );
  assert(result.ok);
  const dict = result.value as PdfDictionary;
  const inner = dict.entries.get("A") as PdfDictionary;
  expect(inner.type).toBe("dictionary");
  expect(inner.entries.get("B")).toEqual({ type: "integer", value: 1 });
});

test("キーが Name でない場合 OBJECT_PARSE_UNEXPECTED_TOKEN エラー", () => {
  const result = DirectObject.parse(btOf("<< 1 2 >>"), ByteOffset.of(0), 0);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("閉じなし辞書で OBJECT_PARSE_UNTERMINATED エラー", () => {
  const result = DirectObject.parse(btOf("<</A 1"), ByteOffset.of(0), 0);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNTERMINATED");
});

test("辞書ネスト深度超過で NESTING_TOO_DEEP エラー", () => {
  const parts: string[] = [];
  for (let i = 0; i < 101; i++) {
    parts.push("<</K ");
  }
  for (let i = 0; i < 101; i++) {
    parts.push(">>");
  }
  const input = parts.join("");
  const result = DirectObject.parse(btOf(input), ByteOffset.of(0), 0);
  assert(!result.ok);
  expect(result.error.code).toBe("NESTING_TOO_DEEP");
});
