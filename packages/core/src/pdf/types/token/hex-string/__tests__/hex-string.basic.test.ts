import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../byte-offset/index";
import { TokenType } from "../../index";
import { TokenHexString } from "../index";

test("偶数桁 hex を decode して PdfString(encoding:'hex') を返す", () => {
  const token: TokenHexString = {
    type: TokenType.HexString,
    value: "48656C6C6F",
    offset: ByteOffset.of(0),
  };
  const result = TokenHexString.toPdfValue(token);
  assert(result.ok);
  assert(result.value.some);
  expect(result.value.value).toEqual({
    type: "string",
    value: new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]),
    encoding: "hex",
  });
});

test("奇数桁 hex は末尾 0 補完で decode される", () => {
  const token: TokenHexString = {
    type: TokenType.HexString,
    value: "414",
    offset: ByteOffset.of(0),
  };
  const result = TokenHexString.toPdfValue(token);
  assert(result.ok);
  assert(result.value.some);
  expect(result.value.value).toEqual({
    type: "string",
    value: new Uint8Array([0x41, 0x40]),
    encoding: "hex",
  });
});

test("空文字列を空のバイト列として decode する", () => {
  const token: TokenHexString = {
    type: TokenType.HexString,
    value: "",
    offset: ByteOffset.of(0),
  };
  const result = TokenHexString.toPdfValue(token);
  assert(result.ok);
  assert(result.value.some);
  expect(result.value.value).toEqual({
    type: "string",
    value: new Uint8Array([]),
    encoding: "hex",
  });
});

test("非 hex 文字を含むと OBJECT_PARSE_UNEXPECTED_TOKEN と decoded.error を返す", () => {
  const token: TokenHexString = {
    type: TokenType.HexString,
    value: "ZZ",
    offset: ByteOffset.of(5),
  };
  const result = TokenHexString.toPdfValue(token);
  assert(!result.ok);
  assert(result.error.code === "OBJECT_PARSE_UNEXPECTED_TOKEN");
  expect(result.error.message).toBe('Invalid hex digits in hex string: "ZZ"');
  expect(result.error.offset).toBe(5);
});
