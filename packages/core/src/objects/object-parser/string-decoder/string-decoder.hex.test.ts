import { assert, expect, test } from "vitest";
import { decodeHexString } from "./index";

test("偶数桁の16進文字列をバイト配列に変換する", () => {
  const result = decodeHexString("48656C6C6F");
  assert(result.ok);
  expect(new TextDecoder().decode(result.value)).toBe("Hello");
});

test("奇数桁の16進文字列は末尾に 0 をパディングする", () => {
  const result = decodeHexString("ABC");
  assert(result.ok);
  expect(result.value).toEqual(new Uint8Array([0xab, 0xc0]));
});

test("空文字列を変換すると空のバイト配列を返す", () => {
  const result = decodeHexString("");
  assert(result.ok);
  expect(result.value).toEqual(new Uint8Array([]));
});

test("不正な16進文字を含むとエラー", () => {
  const result = decodeHexString("1G");
  expect(result.ok).toBe(false);
});
