import { assert, expect, test } from "vitest";
import { decompressFlate } from "./flatedecode";

test("不正な圧縮データに対してFLATEDECODE_FAILEDエラーを返す", async () => {
  const invalid = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc]);
  const result = await decompressFlate(invalid);
  expect(result.ok).toBe(false);
  assert(!result.ok);
  expect(result.error.code).toBe("FLATEDECODE_FAILED");
});

test("空のUint8Array（長さ0）を入力した場合にFLATEDECODE_FAILEDエラーを返す", async () => {
  const empty = new Uint8Array(0);
  const result = await decompressFlate(empty);
  expect(result.ok).toBe(false);
  assert(!result.ok);
  expect(result.error.code).toBe("FLATEDECODE_FAILED");
});

test("展開サイズがmaxDecompressedSizeを超過した場合にFLATEDECODE_FAILEDエラーを返す", async () => {
  // "Hello, PDF!" (11 bytes) に展開されるzlib圧縮データ
  const compressed = new Uint8Array([
    120, 156, 243, 72, 205, 201, 201, 215, 81, 8, 112, 113, 83, 4, 0, 21, 171,
    3, 60,
  ]);
  const result = await decompressFlate(compressed, 5);
  expect(result.ok).toBe(false);
  assert(!result.ok);
  expect(result.error.code).toBe("FLATEDECODE_FAILED");
  expect(result.error.message).toContain("exceeds limit");
});
