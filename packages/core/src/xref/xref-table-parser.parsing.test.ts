import { expect, test } from "vitest";
import type { ByteOffset } from "../types/index.js";
import { parseXRefTable } from "./xref-table-parser.js";

// --- ヘルパー ---

const encoder = new TextEncoder();

function encode(str: string): Uint8Array {
  return encoder.encode(str);
}

/**
 * xref テーブルバイナリを構築する。
 * entries は "OOOOOOOOOO GGGGG T" 形式の18バイト文字列の配列。
 * subsectionHeaders は ["0 2", "5 1"] 形式のヘッダ配列。
 */
function buildXRefBytes(
  sections: Array<{ header: string; entries: string[] }>,
  entryEol: "\r\n" | "\n" | "\r " = "\r\n",
): Uint8Array {
  const parts: string[] = ["xref\n"];
  for (const section of sections) {
    parts.push(`${section.header}\n`);
    for (const entry of section.entries) {
      parts.push(`${entry}${entryEol}`);
    }
  }
  parts.push("trailer");
  return encode(parts.join(""));
}

// --- 正常系 ---

test("単一サブセクション (1エントリ, n) をパースできる", () => {
  const data = buildXRefBytes([
    { header: "0 1", entries: ["0000000100 00000 n"] },
  ]);
  const result = parseXRefTable(data, 0 as ByteOffset);
  expect(result.ok).toBe(true);
  expect(
    (
      result as {
        ok: true;
        value: {
          xref: { entries: Map<number, unknown>; size: number };
          trailerOffset: number;
        };
      }
    ).value.xref.entries.get(0),
  ).toEqual({
    type: 1,
    field2: 100,
    field3: 0,
  });
  expect(
    (result as { ok: true; value: { xref: { size: number } } }).value.xref.size,
  ).toBe(1);
});

test("オブジェクト0 (f, gen=65535) + オブジェクト1 (n, gen=0) をパースできる", () => {
  const data = buildXRefBytes([
    {
      header: "0 2",
      entries: ["0000000000 65535 f", "0000000100 00000 n"],
    },
  ]);
  const result = parseXRefTable(data, 0 as ByteOffset);
  expect(result.ok).toBe(true);
  const entries = (
    result as { ok: true; value: { xref: { entries: Map<number, unknown> } } }
  ).value.xref.entries;
  expect(entries.get(0)).toEqual({ type: 0, field2: 0, field3: 65535 });
  expect(entries.get(1)).toEqual({ type: 1, field2: 100, field3: 0 });
});

test("複数サブセクション (0 2 + 5 1) をパースできる", () => {
  const data = buildXRefBytes([
    {
      header: "0 2",
      entries: ["0000000000 65535 f", "0000000100 00000 n"],
    },
    { header: "5 1", entries: ["0000000200 00000 n"] },
  ]);
  const result = parseXRefTable(data, 0 as ByteOffset);
  expect(result.ok).toBe(true);
  const value = (
    result as {
      ok: true;
      value: { xref: { entries: Map<number, unknown>; size: number } };
    }
  ).value;
  expect(value.xref.entries.size).toBe(3);
  expect(value.xref.entries.get(0)).toEqual({
    type: 0,
    field2: 0,
    field3: 65535,
  });
  expect(value.xref.entries.get(1)).toEqual({
    type: 1,
    field2: 100,
    field3: 0,
  });
  expect(value.xref.entries.get(5)).toEqual({
    type: 1,
    field2: 200,
    field3: 0,
  });
  expect(value.xref.size).toBe(6);
});

test("size は最大の firstObj+count になる", () => {
  const data = buildXRefBytes([
    { header: "0 1", entries: ["0000000000 65535 f"] },
    {
      header: "10 2",
      entries: ["0000000100 00000 n", "0000000200 00000 n"],
    },
  ]);
  const result = parseXRefTable(data, 0 as ByteOffset);
  expect(result.ok).toBe(true);
  expect(
    (result as { ok: true; value: { xref: { size: number } } }).value.xref.size,
  ).toBe(12);
});

test("trailerOffset が trailer キーワードの先頭バイト位置と一致する", () => {
  const data = buildXRefBytes([
    { header: "0 1", entries: ["0000000100 00000 n"] },
  ]);
  const expectedTrailerOffset = data.length - "trailer".length;
  const result = parseXRefTable(data, 0 as ByteOffset);
  expect(result.ok).toBe(true);
  expect(
    (result as { ok: true; value: { trailerOffset: number } }).value
      .trailerOffset,
  ).toBe(expectedTrailerOffset);
});

// --- EOL バリエーション ---

test.each([
  { eol: "\r\n" as const, label: "CR+LF (0x0D 0x0A)" },
  { eol: "\n" as const, label: "LF のみ (0x0A)" },
  { eol: "\r " as const, label: "CR+SP (0x0D 0x20)" },
])("EOL: $label をパースできる", ({ eol }) => {
  const data = buildXRefBytes(
    [{ header: "0 1", entries: ["0000000100 00000 n"] }],
    eol,
  );
  const result = parseXRefTable(data, 0 as ByteOffset);
  expect(result.ok).toBe(true);
  expect(
    (
      result as { ok: true; value: { xref: { entries: Map<number, unknown> } } }
    ).value.xref.entries.get(0),
  ).toEqual({
    type: 1,
    field2: 100,
    field3: 0,
  });
});
