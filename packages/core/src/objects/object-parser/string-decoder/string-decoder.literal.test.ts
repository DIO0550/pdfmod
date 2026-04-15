import { assert, expect, test } from "vitest";
import { decodeLiteralString } from "./index";

test("リテラル文字列をバイト配列に変換する", () => {
  const result = decodeLiteralString("hello");
  assert(result.ok);
  expect(new TextDecoder().decode(result.value)).toBe("hello");
});

test("空文字列を変換すると空のバイト配列を返す", () => {
  const result = decodeLiteralString("");
  assert(result.ok);
  expect(result.value).toEqual(new Uint8Array([]));
});

test("0xff を超える code unit でエラー", () => {
  const result = decodeLiteralString("あ");
  expect(result.ok).toBe(false);
});
