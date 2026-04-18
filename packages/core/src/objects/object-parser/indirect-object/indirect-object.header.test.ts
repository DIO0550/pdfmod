import { assert, expect, test } from "vitest";
import { Tokenizer } from "../../../lexer/tokenizer/index";
import { ByteOffset } from "../../../pdf/types/byte-offset/index";
import { BufferedTokenizer } from "../buffered-tokenizer/index";
import { IndirectObject } from "./index";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const btOf = (s: string): BufferedTokenizer =>
  new BufferedTokenizer(new Tokenizer(enc(s)));

test("正常な N G obj ヘッダから objectNumber と generationNumber が返る", () => {
  const result = IndirectObject.parseHeader(btOf("10 0 obj"), ByteOffset.of(0));
  assert(result.ok);
  expect(result.value.objectNumber).toBe(10);
  expect(result.value.generationNumber).toBe(0);
});

test("objectNumber が integer でないときエラー", () => {
  const result = IndirectObject.parseHeader(
    btOf("/Foo 0 obj"),
    ByteOffset.of(0),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("generationNumber が integer でないときエラー", () => {
  const result = IndirectObject.parseHeader(
    btOf("10 /Foo obj"),
    ByteOffset.of(0),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("obj キーワードがないときエラー", () => {
  const result = IndirectObject.parseHeader(btOf("10 0 foo"), ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("負の objectNumber でエラー", () => {
  const result = IndirectObject.parseHeader(btOf("-1 0 obj"), ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("負の generationNumber でエラー", () => {
  const result = IndirectObject.parseHeader(btOf("1 -1 obj"), ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});
