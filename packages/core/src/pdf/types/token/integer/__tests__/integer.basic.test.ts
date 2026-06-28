import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../byte-offset/index";
import { TokenType } from "../../index";
import { TokenInteger } from "../index";

test("正の整数の TokenInteger を PdfInteger に変換する", () => {
  const token: TokenInteger = {
    type: TokenType.Integer,
    value: 42,
    offset: ByteOffset.of(10),
  };
  const result = TokenInteger.toPdfValue(token);
  assert(result.ok);
  assert(result.value.some);
  expect(result.value.value).toEqual({ type: "integer", value: 42 });
});

test("ゼロの TokenInteger を PdfInteger に変換する", () => {
  const token: TokenInteger = {
    type: TokenType.Integer,
    value: 0,
    offset: ByteOffset.of(0),
  };
  const result = TokenInteger.toPdfValue(token);
  assert(result.ok);
  assert(result.value.some);
  expect(result.value.value).toEqual({ type: "integer", value: 0 });
});

test("負の整数の TokenInteger を PdfInteger に変換する", () => {
  const token: TokenInteger = {
    type: TokenType.Integer,
    value: -7,
    offset: ByteOffset.of(3),
  };
  const result = TokenInteger.toPdfValue(token);
  assert(result.ok);
  assert(result.value.some);
  expect(result.value.value).toEqual({ type: "integer", value: -7 });
});

test("NaN 整数 token に対し OBJECT_PARSE_UNEXPECTED_TOKEN を返す", () => {
  const token: TokenInteger = {
    type: TokenType.Integer,
    value: NaN,
    offset: ByteOffset.of(10),
  };
  const result = TokenInteger.toPdfValue(token);
  assert(!result.ok);
  assert(result.error.code === "OBJECT_PARSE_UNEXPECTED_TOKEN");
  expect(result.error.message).toBe("NaN integer token at offset 10");
  expect(result.error.offset).toBe(10);
});

test("NaN 整数 token のメッセージは offset を動的に展開する", () => {
  const token: TokenInteger = {
    type: TokenType.Integer,
    value: NaN,
    offset: ByteOffset.of(99),
  };
  const result = TokenInteger.toPdfValue(token);
  assert(!result.ok);
  expect(result.error.message).toBe("NaN integer token at offset 99");
});
