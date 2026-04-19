import { assert, expect, test } from "vitest";
import { Tokenizer } from "../../../lexer/tokenizer/index";
import { ByteOffset } from "../../../pdf/types/byte-offset/index";
import { BufferedTokenizer } from "../buffered-tokenizer/index";
import { IndirectObject } from "./index";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const btOf = (s: string): BufferedTokenizer =>
  new BufferedTokenizer(new Tokenizer(enc(s)));

test("expectEndobj: 正常", () => {
  const result = IndirectObject.expectEndobj(btOf("endobj"), ByteOffset.of(0));
  expect(result.ok).toBe(true);
});

test("expectEndobj: EOF で OBJECT_PARSE_UNTERMINATED", () => {
  const result = IndirectObject.expectEndobj(btOf(""), ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNTERMINATED");
});

test("expectEndobj: 誤トークンで OBJECT_PARSE_UNEXPECTED_TOKEN", () => {
  const result = IndirectObject.expectEndobj(btOf("foo"), ByteOffset.of(0));
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

test("validateEndobj: 正常", () => {
  const result = IndirectObject.validateEndobj(
    btOf("endobj"),
    ByteOffset.of(0),
  );
  expect(result.some).toBe(false);
});

test("validateEndobj: EOF で OBJECT_PARSE_UNTERMINATED", () => {
  const result = IndirectObject.validateEndobj(btOf(""), ByteOffset.of(0));
  assert(result.some);
  expect(result.value.code).toBe("OBJECT_PARSE_UNTERMINATED");
});

test("validateEndobj: 誤トークンで OBJECT_PARSE_UNEXPECTED_TOKEN", () => {
  const result = IndirectObject.validateEndobj(btOf("foo"), ByteOffset.of(0));
  assert(result.some);
  expect(result.value.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("validateEndobjAt: 正常", () => {
  const data = enc("endobj");
  const result = IndirectObject.validateEndobjAt(data, ByteOffset.of(0));
  expect(result.some).toBe(false);
});

test("validateEndobjAt: EOF で OBJECT_PARSE_UNTERMINATED", () => {
  const data = enc("");
  const result = IndirectObject.validateEndobjAt(data, ByteOffset.of(0));
  assert(result.some);
  expect(result.value.code).toBe("OBJECT_PARSE_UNTERMINATED");
});

test("validateEndobjAt: 誤トークンで OBJECT_PARSE_UNEXPECTED_TOKEN", () => {
  const data = enc("foo");
  const result = IndirectObject.validateEndobjAt(data, ByteOffset.of(0));
  assert(result.some);
  expect(result.value.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("validateEndobj: 非 0 baseOffset 時の誤トークン offset は baseOffset + token.offset", () => {
  const result = IndirectObject.validateEndobj(btOf("foo"), ByteOffset.of(10));
  assert(result.some);
  expect(result.value.offset as number).toBe(10);
});

test("validateEndobj: 非 0 baseOffset 時の EOF offset は baseOffset + token.offset", () => {
  const result = IndirectObject.validateEndobj(btOf(""), ByteOffset.of(10));
  assert(result.some);
  expect(result.value.offset as number).toBe(10);
});

test("validateEndobjAt: 非 0 absPos 時の誤トークン offset は absPos + token.offset", () => {
  const padding = new Uint8Array(20);
  padding.fill(0x20);
  const tail = enc("foo");
  const data = new Uint8Array(padding.length + tail.length);
  data.set(padding, 0);
  data.set(tail, padding.length);
  const result = IndirectObject.validateEndobjAt(data, ByteOffset.of(20));
  assert(result.some);
  expect(result.value.offset as number).toBe(20);
});

test("validateEndobjAt: 非 0 absPos 時の EOF offset は absPos そのまま", () => {
  const data = new Uint8Array(20);
  data.fill(0x20);
  const result = IndirectObject.validateEndobjAt(data, ByteOffset.of(20));
  assert(result.some);
  expect(result.value.offset as number).toBe(20);
});
