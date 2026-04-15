import { assert, expect, test } from "vitest";
import { Tokenizer } from "../../../lexer/tokenizer/index";
import { ByteOffset } from "../../../types/byte-offset/index";
import { BufferedTokenizer } from "../buffered-tokenizer/index";
import { IndirectObject } from "./index";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const btOf = (s: string): BufferedTokenizer =>
  new BufferedTokenizer(new Tokenizer(enc(s)));

test("expectEndobj: 正常", () => {
  const result = IndirectObject.expectEndobj(btOf("endobj"), 0);
  expect(result.ok).toBe(true);
});

test("expectEndobj: EOF で OBJECT_PARSE_UNTERMINATED", () => {
  const result = IndirectObject.expectEndobj(btOf(""), 0);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNTERMINATED");
});

test("expectEndobj: 誤トークンで OBJECT_PARSE_UNEXPECTED_TOKEN", () => {
  const result = IndirectObject.expectEndobj(btOf("foo"), 0);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("expectEndobjAfter: 正常", () => {
  const data = enc("endobj");
  const result = IndirectObject.expectEndobjAfter(data, ByteOffset.of(0));
  expect(result.ok).toBe(true);
});

test("expectEndobjAfter: EOF で OBJECT_PARSE_UNTERMINATED", () => {
  const data = enc("");
  const result = IndirectObject.expectEndobjAfter(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNTERMINATED");
});

test("expectEndobjAfter: 誤トークンで OBJECT_PARSE_UNEXPECTED_TOKEN", () => {
  const data = enc("foo");
  const result = IndirectObject.expectEndobjAfter(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});
