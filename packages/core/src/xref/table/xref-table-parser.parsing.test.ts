import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../types/byte-offset";
import { GenerationNumber } from "../../types/generation-number";
import { ObjectNumber } from "../../types/object-number";
import { parseXRefTable } from "./xref-table-parser";

const encoder = new TextEncoder();

function encode(str: string): Uint8Array {
  return encoder.encode(str);
}

function buildXRefBytes(
  sections: Array<{ header: string; entries: string[] }>,
  entryEol: "\r\n" | "\n" | "\r " | "\r" = "\r\n",
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

test("単一サブセクション (1エントリ, n) をパースできる", () => {
  const data = buildXRefBytes([
    { header: "0 1", entries: ["0000000100 00000 n"] },
  ]);
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(result.ok);
  expect(result.value.xref.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(100),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.xref.size).toBe(1);
});

test("オブジェクト0 (f, gen=65535) + オブジェクト1 (n, gen=0) をパースできる", () => {
  const data = buildXRefBytes([
    {
      header: "0 2",
      entries: ["0000000000 65535 f", "0000000100 00000 n"],
    },
  ]);
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(result.ok);
  expect(result.value.xref.entries.get(ObjectNumber.of(0))).toEqual({
    type: 0,
    nextFreeObject: ObjectNumber.of(0),
    generationNumber: GenerationNumber.of(65535),
  });
  expect(result.value.xref.entries.get(ObjectNumber.of(1))).toEqual({
    type: 1,
    offset: ByteOffset.of(100),
    generationNumber: GenerationNumber.of(0),
  });
});

test("複数サブセクション (0 2 + 5 1) をパースできる", () => {
  const data = buildXRefBytes([
    {
      header: "0 2",
      entries: ["0000000000 65535 f", "0000000100 00000 n"],
    },
    { header: "5 1", entries: ["0000000200 00000 n"] },
  ]);
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(result.ok);
  expect(result.value.xref.entries.size).toBe(3);
  expect(result.value.xref.entries.get(ObjectNumber.of(0))).toEqual({
    type: 0,
    nextFreeObject: ObjectNumber.of(0),
    generationNumber: GenerationNumber.of(65535),
  });
  expect(result.value.xref.entries.get(ObjectNumber.of(1))).toEqual({
    type: 1,
    offset: ByteOffset.of(100),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.xref.entries.get(ObjectNumber.of(5))).toEqual({
    type: 1,
    offset: ByteOffset.of(200),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.xref.size).toBe(6);
});

test("size は最大の firstObj+count になる", () => {
  const data = buildXRefBytes([
    { header: "0 1", entries: ["0000000000 65535 f"] },
    {
      header: "10 2",
      entries: ["0000000100 00000 n", "0000000200 00000 n"],
    },
  ]);
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(result.ok);
  expect(result.value.xref.size).toBe(12);
});

test("trailerOffset が trailer キーワードの先頭バイト位置と一致する", () => {
  const data = buildXRefBytes([
    { header: "0 1", entries: ["0000000100 00000 n"] },
  ]);
  const expectedTrailerOffset = data.length - "trailer".length;
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(result.ok);
  expect(result.value.trailerOffset).toBe(expectedTrailerOffset);
});

test.each([
  { eol: "\r\n" as const, label: "CR+LF (0x0D 0x0A)" },
  { eol: "\n" as const, label: "LF のみ (0x0A)" },
  { eol: "\r " as const, label: "CR+SP (0x0D 0x20)" },
  { eol: "\r" as const, label: "CR のみ (0x0D)" },
])("EOL: $label をパースできる", ({ eol }) => {
  const data = buildXRefBytes(
    [{ header: "0 1", entries: ["0000000100 00000 n"] }],
    eol,
  );
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(result.ok);
  expect(result.value.xref.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(100),
    generationNumber: GenerationNumber.of(0),
  });
});

test("フラグ直後に SPACE が入る形式 (f SP CR LF) をパースできる", () => {
  const raw = encode(
    "xref\n0 2\n0000000000 65535 f \r\n0000000100 00000 n \r\ntrailer",
  );
  const result = parseXRefTable(raw, ByteOffset.of(0));
  assert(result.ok);
  expect(result.value.xref.entries.get(ObjectNumber.of(0))).toEqual({
    type: 0,
    nextFreeObject: ObjectNumber.of(0),
    generationNumber: GenerationNumber.of(65535),
  });
  expect(result.value.xref.entries.get(ObjectNumber.of(1))).toEqual({
    type: 1,
    offset: ByteOffset.of(100),
    generationNumber: GenerationNumber.of(0),
  });
});

test("非0世代番号 (gen=00002) の使用中エントリをパースできる", () => {
  const data = buildXRefBytes([
    { header: "0 1", entries: ["0000000500 00002 n"] },
  ]);
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(result.ok);
  expect(result.value.xref.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(500),
    generationNumber: GenerationNumber.of(2),
  });
});

test("freeエントリの次freeオブジェクト番号が非0のとき正しく格納される", () => {
  const data = buildXRefBytes([
    { header: "0 1", entries: ["0000000005 65535 f"] },
  ]);
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(result.ok);
  expect(result.value.xref.entries.get(ObjectNumber.of(0))).toEqual({
    type: 0,
    nextFreeObject: ObjectNumber.of(5),
    generationNumber: GenerationNumber.of(65535),
  });
});

test("サブセクション間にコメントがあっても次サブセクションをパースできる", () => {
  const raw = encode(
    "xref\n0 1\n0000000000 65535 f\r\n% comment\n5 1\n0000000200 00000 n\r\ntrailer",
  );
  const result = parseXRefTable(raw, ByteOffset.of(0));
  assert(result.ok);
  expect(result.value.xref.entries.size).toBe(2);
  expect(result.value.xref.entries.get(ObjectNumber.of(5))).toEqual({
    type: 1,
    offset: ByteOffset.of(200),
    generationNumber: GenerationNumber.of(0),
  });
});

test("巨大だがsafe integerなoffset値を正しく格納する", () => {
  const data = buildXRefBytes([
    { header: "0 1", entries: ["9999999999 00000 n"] },
  ]);
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(result.ok);
  expect(result.value.xref.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(9999999999),
    generationNumber: GenerationNumber.of(0),
  });
});
