import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../byte-offset/index";
import { TokenType } from "../../index";
import { TokenLiteralString } from "../index";

test("ASCII リテラルを decode して PdfString(encoding:'literal') を返す", () => {
  const token: TokenLiteralString = {
    type: TokenType.LiteralString,
    value: "Hello",
    offset: ByteOffset.of(0),
  };
  const result = TokenLiteralString.toPdfValue(token);
  assert(result.ok);
  assert(result.value.some);
  expect(result.value.value).toEqual({
    type: "string",
    value: new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]),
    encoding: "literal",
  });
});

test("バックスラッシュを含むリテラルをエスケープ非解釈で素通しする", () => {
  const token: TokenLiteralString = {
    type: TokenType.LiteralString,
    value: "a\\nb",
    offset: ByteOffset.of(0),
  };
  const result = TokenLiteralString.toPdfValue(token);
  assert(result.ok);
  assert(result.value.some);
  expect(result.value.value).toEqual({
    type: "string",
    value: new Uint8Array([0x61, 0x5c, 0x6e, 0x62]),
    encoding: "literal",
  });
});

test("空文字列を空のバイト列として decode する", () => {
  const token: TokenLiteralString = {
    type: TokenType.LiteralString,
    value: "",
    offset: ByteOffset.of(0),
  };
  const result = TokenLiteralString.toPdfValue(token);
  assert(result.ok);
  assert(result.value.some);
  expect(result.value.value).toEqual({
    type: "string",
    value: new Uint8Array([]),
    encoding: "literal",
  });
});

test("decode 失敗時は OBJECT_PARSE_UNEXPECTED_TOKEN と decoded.error を返す", () => {
  const token: TokenLiteralString = {
    type: TokenType.LiteralString,
    value: "Ā",
    offset: ByteOffset.of(0),
  };
  const result = TokenLiteralString.toPdfValue(token);
  assert(!result.ok);
  assert(result.error.code === "OBJECT_PARSE_UNEXPECTED_TOKEN");
  expect(result.error.message).toBe(
    "Invalid literal string byte value: 256 at index 0",
  );
  expect(result.error.offset).toBe(0);
});
