import { expect, test } from "vitest";
import { decompressFlate } from "./flatedecode";

test("不正な圧縮データに対してFLATEDECODE_FAILEDエラーを返す", async () => {
  const invalid = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc]);
  const result = await decompressFlate(invalid);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.error.code).toBe("FLATEDECODE_FAILED");
});

test("空のUint8Array（長さ0）を入力した場合にFLATEDECODE_FAILEDエラーを返す", async () => {
  const empty = new Uint8Array(0);
  const result = await decompressFlate(empty);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.error.code).toBe("FLATEDECODE_FAILED");
});
