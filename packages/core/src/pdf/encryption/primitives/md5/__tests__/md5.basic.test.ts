import { expect, test } from "vitest";
import { vectorBytes } from "../../__tests__/vectors.test.helpers";
import { Md5 } from "../index";

// RFC 1321 Appendix A.5 と Rust 版の MD5 テストと同じ値。
test.each([
  ["", "d41d8cd98f00b204e9800998ecf8427e"],
  ["a", "0cc175b9c0f1b6a831c399e269772661"],
  ["abc", "900150983cd24fb0d6963f7d28e17f72"],
  ["message digest", "f96b697d7cb7938d525a2f31aaf161d0"],
  ["abcdefghijklmnopqrstuvwxyz", "c3fcd3d76192e4007dfb496cca67e13b"],
  [
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    "d174ab98d277d9f5a5611c2c9f419d9f",
  ],
  ["1234567890".repeat(8), "57edf4a22be3c955ac49da2e2107b67a"],
])("RFC 1321 の入力 %j が既知の MD5 ダイジェストになる", (message, expected) => {
  const input = new TextEncoder().encode(message);

  expect(Md5.digest(input)).toEqual(vectorBytes(expected));
});

test.each([
  [55, "6912ee65fff2d9f9ce2508cddf8bcda0"],
  [56, "51fdd1acda72405dfdfa03fcb85896d7"],
  [64, "b2d3f56bc197fd985d5965079b5e7148"],
])("%i バイトの部分ビューの範囲だけを MD5 でハッシュする", (length, expected) => {
  const buffer = Uint8Array.from(
    { length: length + 2 },
    (_, index) => index - 1,
  );
  const input = buffer.subarray(1, -1);

  expect(Md5.digest(input)).toEqual(vectorBytes(expected));
});
