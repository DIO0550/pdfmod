import { assert, expect, test } from "vitest";
import {
  createFlateDecompressor,
  DEFAULT_OBJECT_STREAM_MAX_DECOMPRESSED_SIZE,
} from "../index";
import { buildStoredZlib } from "./flate-decompressor.test.helpers";

const OVERSIZED_PAYLOAD_FILL_BYTE = 0x41;

test("デフォルトオプション使用時は8MB上限を超えるデータの展開がエラーになる", async () => {
  const payload = new Uint8Array(
    DEFAULT_OBJECT_STREAM_MAX_DECOMPRESSED_SIZE + 1,
  ).fill(OVERSIZED_PAYLOAD_FILL_BYTE);
  const compressed = buildStoredZlib(payload);
  const decompressor = createFlateDecompressor();

  const result = await decompressor.decompress(compressed);

  expect(result.ok).toBe(false);
  assert(!result.ok);
  expect(result.error.code).toBe("FLATEDECODE_FAILED");
});

test("maxDecompressedSizeオプションで上限を上書きすると8MBを超えるデータも展開できる", async () => {
  const payload = new Uint8Array(
    DEFAULT_OBJECT_STREAM_MAX_DECOMPRESSED_SIZE + 1,
  ).fill(OVERSIZED_PAYLOAD_FILL_BYTE);
  const compressed = buildStoredZlib(payload);
  const decompressor = createFlateDecompressor({
    maxDecompressedSize: DEFAULT_OBJECT_STREAM_MAX_DECOMPRESSED_SIZE * 2,
  });

  const result = await decompressor.decompress(compressed);

  assert(result.ok);
  expect(result.value.length).toBe(payload.length);
});

test("上限超過時に下位のdecompressFlateのエラーがそのまま伝播する", async () => {
  // zlib.deflateSync(Buffer.from("Hello, PDF!")) -> 展開後11バイト
  const compressed = new Uint8Array([
    120, 156, 243, 72, 205, 201, 201, 215, 81, 8, 112, 113, 83, 4, 0, 21, 171,
    3, 60,
  ]);
  const decompressor = createFlateDecompressor({ maxDecompressedSize: 5 });

  const result = await decompressor.decompress(compressed);

  expect(result.ok).toBe(false);
  assert(!result.ok);
  expect(result.error.code).toBe("FLATEDECODE_FAILED");
  expect(result.error.message).toContain("exceeds limit of 5 bytes");
});
