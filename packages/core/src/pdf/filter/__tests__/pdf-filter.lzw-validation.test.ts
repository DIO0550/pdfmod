import { assert, expect, test } from "vitest";
import type { PdfValue } from "../../types/pdf-types/index";
import { PdfFilter } from "../index";
import { lzwFixture } from "./lzw.test.helpers";

test.each([
  { label: "空入力", data: new Uint8Array() },
  { label: "不完全なコード", data: new Uint8Array([128]) },
  { label: "EOD がない", data: new Uint8Array([128, 16, 64]) },
])("LZW の $label は展開エラーになる", async ({ data }) => {
  const result = await PdfFilter.decode(data, "LZWDecode");
  assert(!result.ok);
  expect(result.error).toMatchObject({
    code: "LZWDECODE_FAILED",
    message: expect.stringContaining("EOD"),
  });
});

test.each([
  [256, 258, 257],
  [256, 65, 259, 257],
  [256, 65, 258, 256, 258, 257],
])("LZW で復元できない未登録コード %j は展開エラーになる", async (...codes) => {
  const result = await PdfFilter.decode(
    lzwFixture([{ width: 9, codes }]),
    "LZWDecode",
  );
  assert(!result.ok);
  expect(result.error).toMatchObject({
    code: "LZWDECODE_FAILED",
    message: expect.stringContaining("Invalid LZW code"),
  });
});

test.each<PdfValue>([
  { type: "integer", value: -1 },
  { type: "integer", value: 2 },
  { type: "real", value: 0.5 },
  { type: "name", value: "1" },
  { type: "null" },
])("不正な EarlyChange %j は展開エラーになる", async (entry) => {
  const result = await PdfFilter.decode(
    new Uint8Array([128, 64, 64]),
    "LZWDecode",
    {
      decodeParms: new Map([["EarlyChange", entry]]),
    },
  );
  assert(!result.ok);
  expect(result.error).toMatchObject({
    code: "LZWDECODE_FAILED",
    message: expect.stringContaining("EarlyChange"),
  });
});

test.each([
  0,
  -1,
  0.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
])("LZW の不正な展開上限 %j を拒否する", async (maxDecompressedSize) => {
  const result = await PdfFilter.decode(
    new Uint8Array([128, 64, 64]),
    "LZWDecode",
    { maxDecompressedSize },
  );
  assert(!result.ok);
  expect(result.error).toMatchObject({
    code: "LZWDECODE_FAILED",
    message: expect.stringContaining("maxDecompressedSize"),
  });
});

test("LZW の特殊コードによる出力が上限を超えたらエラーになる", async () => {
  const result = await PdfFilter.decode(
    new Uint8Array([128, 16, 96, 80, 16]),
    "LZWDecode",
    { maxDecompressedSize: 2 },
  );
  assert(!result.ok);
  expect(result.error).toEqual({
    code: "LZWDECODE_FAILED",
    message: "Decompressed size exceeds limit of 2 bytes",
  });
});

test("LZW の出力サイズが上限と等しければ展開できる", async () => {
  const result = await PdfFilter.decode(
    new Uint8Array([128, 16, 96, 80, 16]),
    "LZWDecode",
    { maxDecompressedSize: 3 },
  );
  expect(result).toEqual({ ok: true, value: new Uint8Array([65, 65, 65]) });
});
