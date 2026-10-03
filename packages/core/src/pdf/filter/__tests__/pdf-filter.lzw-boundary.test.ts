import { assert, expect, test } from "vitest";
import type { PdfValue } from "../../types/pdf-types/index";
import { PdfFilter } from "../index";
import { lzwFixture } from "./lzw.test.helpers";

test.each([
  0, 1,
])("EarlyChange=%i で9→10→11→12ビットの境界を展開する", async (earlyChange) => {
  const data = lzwFixture([
    { width: 9, codes: [256, ...Array<number>(255 - earlyChange).fill(65)] },
    { width: 10, codes: Array<number>(512).fill(66) },
    { width: 11, codes: Array<number>(1024).fill(67) },
    { width: 12, codes: [68, 257] },
  ]);
  const result = await PdfFilter.decode(data, "LZWDecode", {
    decodeParms: new Map<string, PdfValue>([
      ["EarlyChange", { type: "integer", value: earlyChange }],
    ]),
  });
  assert(result.ok);
  const expected = `${"A".repeat(255 - earlyChange)}${"B".repeat(512)}${"C".repeat(1024)}D`;
  expect(new TextDecoder().decode(result.value)).toBe(expected);
});

test("EarlyChange の省略時は1のタイミングでコード幅を拡張する", async () => {
  const data = lzwFixture([
    { width: 9, codes: [256, ...Array<number>(254).fill(65)] },
    { width: 10, codes: [66, 257] },
  ]);
  const result = await PdfFilter.decode(data, "LZWDecode");
  assert(result.ok);
  expect(new TextDecoder().decode(result.value)).toBe(`${"A".repeat(254)}B`);
});

test.each([
  0, 1,
])("EarlyChange=%i で辞書満杯後も12ビットで既存コードを参照できる", async (earlyChange) => {
  const data = lzwFixture([
    { width: 9, codes: [256, ...Array<number>(255 - earlyChange).fill(65)] },
    { width: 10, codes: Array<number>(512).fill(65) },
    { width: 11, codes: Array<number>(1024).fill(65) },
    {
      width: 12,
      codes: [
        ...Array<number>(2048 + earlyChange).fill(65),
        4095,
        66,
        258,
        257,
      ],
    },
  ]);
  const result = await PdfFilter.decode(data, "LZWDecode", {
    decodeParms: new Map<string, PdfValue>([
      ["EarlyChange", { type: "integer", value: earlyChange }],
    ]),
  });
  assert(result.ok);
  expect(new TextDecoder().decode(result.value)).toBe(`${"A".repeat(3841)}BAA`);
});

test("12ビットの ClearTable 後は辞書を破棄して9ビットから再開する", async () => {
  const data = lzwFixture([
    { width: 9, codes: [256, ...Array<number>(254).fill(65)] },
    { width: 10, codes: Array<number>(512).fill(65) },
    { width: 11, codes: Array<number>(1024).fill(65) },
    { width: 12, codes: [256] },
    { width: 9, codes: [256, 66, 258, 257] },
  ]);
  const result = await PdfFilter.decode(data, "LZWDecode");
  assert(result.ok);
  expect(new TextDecoder().decode(result.value)).toBe(`${"A".repeat(1790)}BBB`);
});

test("連続する未登録コードを最長の辞書項目まで復元できる", async () => {
  const data = lzwFixture([
    {
      width: 9,
      codes: [
        256,
        65,
        ...Array.from({ length: 253 }, (_, index) => 258 + index),
      ],
    },
    {
      width: 10,
      codes: Array.from({ length: 512 }, (_, index) => 511 + index),
    },
    {
      width: 11,
      codes: Array.from({ length: 1024 }, (_, index) => 1023 + index),
    },
    {
      width: 12,
      codes: [
        ...Array.from({ length: 2049 }, (_, index) => 2047 + index),
        4095,
        257,
      ],
    },
  ]);
  const result = await PdfFilter.decode(data, "LZWDecode");
  assert(result.ok);
  expect(result.value.length).toBe((3839 * 3840) / 2 + 3839);
  expect(result.value.every((byte) => byte === 65)).toBe(true);
});
