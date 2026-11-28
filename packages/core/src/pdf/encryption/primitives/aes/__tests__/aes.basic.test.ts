import { assert, expect, test } from "vitest";
import { vectorBytes } from "../../__tests__/vectors.test.helpers";
import { createAes } from "./aes.test.helpers";

test.each([
  ["000102030405060708090a0b0c0d0e0f", "69c4e0d86a7b0430d8cdb78070b4c55a"],
  [
    "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    "8ea2b7ca516745bfeafc49904b496089",
  ],
])("FIPS 197 の鍵 %s で ECB の 1 ブロックを復号する", (key, ciphertext) => {
  const aes = createAes(key);

  const result = aes.decryptEcbBlock(vectorBytes(ciphertext));

  assert(result.ok);
  expect(result.value).toEqual(vectorBytes("00112233445566778899aabbccddeeff"));
});

const iv = vectorBytes("000102030405060708090a0b0c0d0e0f");
const plaintext =
  "6bc1bee22e409f96e93d7e117393172a" +
  "ae2d8a571e03ac9c9eb76fac45af8e51" +
  "30c81c46a35ce411e5fbc1191a0a52ef" +
  "f69f2445df4f9b17ad2b417be66c3710";
const key128 = "2b7e151628aed2a6abf7158809cf4f3c";
const ciphertext128 =
  "7649abac8119b246cee98e9b12e9197d" +
  "5086cb9b507219ee95db113a917678b2" +
  "73bed6b8e3c1743b7116e69e22229516" +
  "3ff1caa1681fac09120eca307586e1a7";

// NIST SP 800-38A F.2.2 と F.2.6。
test.each([
  [key128, ciphertext128],
  [
    "603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4",
    "f58c4c04d6e5f1ba779eabfb5f7bfbd6" +
      "9cfc4e967edb808d679f777bc6702c7d" +
      "39f23369a9d9bacfa530e26304231461" +
      "b2eb05e2c39be9fcda6c19078c6a9d1b",
  ],
])("NIST の鍵 %s で CBC の 4 ブロックを復号する", (key, ciphertext) => {
  const aes = createAes(key);
  const data = vectorBytes(ciphertext);

  const result = aes.decryptCbcBlocks({ iv, data });

  assert(result.ok);
  expect(result.value).toEqual(vectorBytes(plaintext));
  expect(data).toEqual(vectorBytes(ciphertext));
});

test("R6 の反復ハッシュで使う AES-128-CBC がパディングを足さない", () => {
  const aes = createAes(key128);

  const result = aes.encryptCbcBlocks({
    iv,
    data: vectorBytes(plaintext),
  });

  assert(result.ok);
  expect(result.value).toEqual(vectorBytes(ciphertext128));
});

const key256 =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

test("AES-256 の PDF 文字列では先頭の IV と末尾のパディングを除く", () => {
  const aes = createAes(key256);
  const input = vectorBytes(
    "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf" +
      "aa21ce5618972cf6990c87a0b04065eb" +
      "1da720b04e5dded942a216c5b4f681df",
  );

  const result = aes.decryptPdfCbc(input);

  assert(result.ok);
  expect(new TextDecoder().decode(result.value)).toBe("PDF stream block!");
});

test("AES-256 の /Perms を復号して権限と末尾の全バイトを保持する", () => {
  const aes = createAes(key256);
  const input = vectorBytes("d2ffe8bc214ebc01dff5af20c2b755c8");

  const result = aes.decryptEcbBlock(input);

  assert(result.ok);
  expect(result.value).toEqual(vectorBytes("fcffffffffffffff5461646200010203"));
});
