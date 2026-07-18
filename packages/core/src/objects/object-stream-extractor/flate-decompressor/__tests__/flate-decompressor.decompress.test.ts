import { assert, expect, test } from "vitest";
import { createFlateDecompressor } from "../index";

test("正常なzlibデータを展開してデコード後の内容が一致する", async () => {
  // zlib.deflateSync(Buffer.from("Hello, PDF!"))
  const compressed = new Uint8Array([
    120, 156, 243, 72, 205, 201, 201, 215, 81, 8, 112, 113, 83, 4, 0, 21, 171,
    3, 60,
  ]);
  const decompressor = createFlateDecompressor();

  const result = await decompressor.decompress(compressed);

  assert(result.ok);
  expect(new TextDecoder().decode(result.value)).toBe("Hello, PDF!");
});
