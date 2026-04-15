import { assert, expect, test } from "vitest";
import { Tokenizer } from "../../../lexer/tokenizer/index";
import { BufferedTokenizer } from "../buffered-tokenizer/index";
import { DirectObject } from "./index";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const btOf = (s: string): BufferedTokenizer =>
  new BufferedTokenizer(new Tokenizer(enc(s)));

test("null リテラルをパースする", () => {
  const result = DirectObject.parse(btOf("null"), 0, 0);
  assert(result.ok);
  expect(result.value).toEqual({ type: "null" });
});

test("true をパースする", () => {
  const result = DirectObject.parse(btOf("true"), 0, 0);
  assert(result.ok);
  expect(result.value).toEqual({ type: "boolean", value: true });
});

test("false をパースする", () => {
  const result = DirectObject.parse(btOf("false"), 0, 0);
  assert(result.ok);
  expect(result.value).toEqual({ type: "boolean", value: false });
});

test("integer をパースする", () => {
  const result = DirectObject.parse(btOf("42"), 0, 0);
  assert(result.ok);
  expect(result.value).toEqual({ type: "integer", value: 42 });
});

test("real をパースする", () => {
  const result = DirectObject.parse(btOf("3.14"), 0, 0);
  assert(result.ok);
  expect(result.value).toEqual({ type: "real", value: 3.14 });
});

test("name をパースする", () => {
  const result = DirectObject.parse(btOf("/Type"), 0, 0);
  assert(result.ok);
  expect(result.value).toEqual({ type: "name", value: "Type" });
});

test("literal string をパースする", () => {
  const result = DirectObject.parse(btOf("(hello)"), 0, 0);
  assert(result.ok);
  expect(result.value.type).toBe("string");
});

test("hex string をパースする", () => {
  const result = DirectObject.parse(btOf("<48>"), 0, 0);
  assert(result.ok);
  expect(result.value.type).toBe("string");
});

test("EOF で OBJECT_PARSE_UNTERMINATED エラー", () => {
  const result = DirectObject.parse(btOf(""), 0, 0);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNTERMINATED");
});

test("予期しないトークン（endobj）で OBJECT_PARSE_UNEXPECTED_TOKEN", () => {
  const result = DirectObject.parse(btOf("endobj"), 0, 0);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});
