import { assert, expect, test } from "vitest";
import { vectorBytes } from "../../__tests__/vectors.test.helpers";
import { Aes } from "../index";
import { createAes } from "./aes.test.helpers";

const key128 = "000102030405060708090a0b0c0d0e0f";
const iv = "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf";

test.each([
  0, 15, 24, 33,
])("PDF で使えない %i バイトの AES 鍵を拒否する", (length) => {
  expect(Aes.create(new Uint8Array(length))).toEqual({
    ok: false,
    error: "INVALID_KEY_LENGTH",
  });
});

test.each([
  0, 15, 17, 32,
])("ECB の 1 ブロックに %i バイト渡すと長さエラーになる", (length) => {
  const aes = createAes(key128);

  expect(aes.decryptEcbBlock(new Uint8Array(length))).toEqual({
    ok: false,
    error: "INVALID_BLOCK_LENGTH",
  });
});

test("CBC の IV が 16 バイトに満たないと IV 長のエラーになる", () => {
  const aes = createAes(key128);

  const result = aes.decryptCbcBlocks({
    iv: new Uint8Array(15),
    data: new Uint8Array(16),
  });

  expect(result).toEqual({ ok: false, error: "INVALID_IV_LENGTH" });
});

test("CBC の末尾がブロック未満なら暗号文の長さエラーになる", () => {
  const aes = createAes(key128);

  const result = aes.decryptCbcBlocks({
    iv: new Uint8Array(16),
    data: new Uint8Array(17),
  });

  expect(result).toEqual({ ok: false, error: "INVALID_BLOCK_LENGTH" });
});

// Rust 版と同じ OpenSSL の暗号文。PDF では IV を先頭に置く。
test.each([
  [
    "0f7108e8240171ebadaae9bf29a4fa21efc6d88a11d76f86b901e934bbb2cd7e",
    "0123456789ABCDEF",
  ],
  ["c7c80bc82ca98d60ad992f01fb77b468", "0123456789ABCD\x01"],
  ["e315209ed0e7c94f74a65c99f6eadc1e", ""],
])("PDF の CBC 暗号文 %s からパディングを除いた平文を得る", (ciphertext, expected) => {
  const aes = createAes(key128);

  const result = aes.decryptPdfCbc(vectorBytes(iv + ciphertext));

  assert(result.ok);
  expect(new TextDecoder().decode(result.value)).toBe(expected);
});

test.each([
  0, 15, 16, 31, 33,
])("PDF の CBC 入力が %i バイトなら長さエラーになる", (length) => {
  const aes = createAes(key128);

  expect(aes.decryptPdfCbc(new Uint8Array(length))).toEqual({
    ok: false,
    error: "INVALID_LENGTH",
  });
});

test.each([
  ["00", "097fac153c4a60c65da846f2c62b7594"],
  ["01 02", "29f3f44782f54428d32dcaf8321b118d"],
  [
    "0x11 が 16 個",
    "0f7108e8240171ebadaae9bf29a4fa212402865661d1b8b69c7054849c76fcef",
  ],
])("PDF の CBC 平文の末尾が %s ならパディングエラーになる", (_, ciphertext) => {
  const aes = createAes(key128);

  const result = aes.decryptPdfCbc(vectorBytes(iv + ciphertext));

  expect(result).toEqual({ ok: false, error: "INVALID_PADDING" });
});
