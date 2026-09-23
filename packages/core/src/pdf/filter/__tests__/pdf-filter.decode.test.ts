import { assert, expect, test } from "vitest";
import { PdfFilter } from "../index";

// zlib.deflateSync(Buffer.from("Hello, PDF!")) -> 11 bytes decompressed
const VALID_ZLIB_DATA = new Uint8Array([
  120, 156, 243, 72, 205, 201, 201, 215, 81, 8, 112, 113, 83, 4, 0, 21, 171, 3,
  60,
]);

test("PdfFilter.decode returns original data when filter is undefined", async () => {
  const input = new Uint8Array([1, 2, 3, 4]);
  const result = await PdfFilter.decode(input, undefined);
  assert(result.ok);
  expect(result.value).toBe(input);
});

test("PdfFilter.decode decodes FlateDecode compressed data", async () => {
  const result = await PdfFilter.decode(VALID_ZLIB_DATA, "FlateDecode");
  assert(result.ok);
  expect(new TextDecoder().decode(result.value)).toBe("Hello, PDF!");
});

test("PdfFilter.decode returns error for unsupported filter", async () => {
  const input = new Uint8Array([1, 2, 3]);
  const result = await PdfFilter.decode(input, "LZWDecode");
  assert(!result.ok);
  expect(result.error.code).toBe("PDF_FILTER_UNSUPPORTED");
  expect(result.error.message).toContain("LZWDecode");
});

test("PdfFilter.decode passes maxDecompressedSize to decompressFlate and fails if exceeded", async () => {
  const result = await PdfFilter.decode(VALID_ZLIB_DATA, "FlateDecode", {
    maxDecompressedSize: 5,
  });
  assert(!result.ok);
  expect(result.error.code).toBe("FLATEDECODE_FAILED");
  expect(result.error.message).toContain("exceeds limit");
});

test("PdfFilter.decode returns error for corrupted FlateDecode data", async () => {
  const truncated = new Uint8Array([0x78, 0x9c, 0x0b, 0xc9]);
  const result = await PdfFilter.decode(truncated, "FlateDecode");
  assert(!result.ok);
  expect(result.error.code).toBe("FLATEDECODE_FAILED");
});
