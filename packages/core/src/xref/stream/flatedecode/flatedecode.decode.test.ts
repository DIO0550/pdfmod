import { assert, expect, test } from "vitest";
import { decompressFlate } from "./index";

test("zlib圧縮された短いバイト列を正しく展開する", async () => {
  // zlib.deflateSync(Buffer.from("Hello, PDF!"))
  const compressed = new Uint8Array([
    120, 156, 243, 72, 205, 201, 201, 215, 81, 8, 112, 113, 83, 4, 0, 21, 171,
    3, 60,
  ]);
  const result = await decompressFlate(compressed);
  assert(result.ok);
  expect(new TextDecoder().decode(result.value)).toBe("Hello, PDF!");
});

test("zlib圧縮された空データを展開すると空のUint8Arrayを返す", async () => {
  // zlib.deflateSync(Buffer.from(""))
  const compressed = new Uint8Array([120, 156, 3, 0, 0, 0, 0, 1]);
  const result = await decompressFlate(compressed);
  assert(result.ok);
  expect(result.value).toBeInstanceOf(Uint8Array);
  expect(result.value.length).toBe(0);
});

test("複数回展開しても同じ結果を返す（冪等性）", async () => {
  const compressed = new Uint8Array([
    120, 156, 243, 72, 205, 201, 201, 215, 81, 8, 112, 113, 83, 4, 0, 21, 171,
    3, 60,
  ]);
  const result1 = await decompressFlate(compressed);
  const result2 = await decompressFlate(compressed);
  assert(result1.ok);
  assert(result2.ok);
  expect(result1.value).toEqual(result2.value);
});

test("大きなデータ（数KB）の展開が正常に動作する", async () => {
  // zlib.deflateSync(Buffer.alloc(4096, 0x42))
  const compressed = new Uint8Array([
    120, 156, 237, 193, 1, 13, 0, 0, 0, 194, 160, 110, 239, 31, 202, 30, 14, 40,
    0, 0, 0, 224, 221, 0, 15, 60, 32, 61,
  ]);
  const result = await decompressFlate(compressed);
  assert(result.ok);
  expect(result.value.length).toBe(4096);
  expect(result.value.every((b) => b === 0x42)).toBe(true);
});
