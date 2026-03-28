import { expect, test } from "vitest";
import { decompressFlate } from "./flatedecode";

test("切り詰められた圧縮データに対してエラーを返す", async () => {
  // zlib header + truncated data
  const truncated = new Uint8Array([120, 156, 243, 72, 205]);
  const result = await decompressFlate(truncated);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.error.code).toBe("FLATEDECODE_FAILED");
});

test("ヘッダのみでデータ部分が欠損した入力に対してエラーを返す", async () => {
  // zlib header only (0x78 0x9C)
  const headerOnly = new Uint8Array([120, 156]);
  const result = await decompressFlate(headerOnly);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.error.code).toBe("FLATEDECODE_FAILED");
});
