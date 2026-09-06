import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../../pdf/types/byte-offset/index";
import { GenerationNumber } from "../../../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../../../pdf/types/object-number/index";
import { decodeXRefStreamEntries } from "../index";

test("/W配列の要素数が3でない場合にエラー", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 2] as unknown as readonly [number, number, number],
    size: 0,
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain(
    "/W array must have exactly 3 elements",
  );
});

test("/W配列に負の値がある場合にエラー", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({ data, w: [1, -1, 1], size: 0 });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain(
    "/W array element must be non-negative safe integer",
  );
});

test("/W配列に非整数がある場合にエラー", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2.5, 1], size: 0 });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("/W配列の要素が非安全整数の場合にエラー", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({
    data,
    w: [Number.MAX_SAFE_INTEGER + 1, 0, 0],
    size: 0,
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("/W配列のフィールド幅が上限(8バイト)を超える場合にエラー", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({ data, w: [1, 9, 1], size: 0 });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain("exceeds maximum 8 bytes");
});

test("sizeが負の場合にエラー", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: -1 });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain("invalid /Size value");
});

test("sizeが非整数の場合にエラー", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 1.5 });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("sizeが非安全整数の場合にエラー", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 2, 1],
    size: Number.MAX_SAFE_INTEGER + 1,
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("データ長が期待値と一致しない場合にエラー", () => {
  const data = new Uint8Array([0x01, 0x00]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 1 });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain("stream data length mismatch");
});

test("/Index配列の要素数が奇数の場合にエラー", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 2, 1],
    size: 10,
    index: [0, 5, 10],
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain("even number");
});

test("不明なType値（3以上）の場合にエラー", () => {
  const data = new Uint8Array([0x03, 0x00, 0x00, 0x00]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 1 });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain("unknown xref entry type: 3");
});

test("/Index配列のcountが負の場合にエラー", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 2, 1],
    size: 10,
    index: [0, -1],
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain("/Index count");
});

test("/Index配列のfirstObjが負の場合にエラー", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 2, 1],
    size: 10,
    index: [-1, 5],
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain("/Index firstObj");
});

test("/Index配列のfirstObjが非整数の場合にエラー", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 2, 1],
    size: 10,
    index: [1.5, 5],
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("/Index配列のfirstObj + count > size の場合にエラー", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 2, 1],
    size: 5,
    index: [3, 5],
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain("/Index range exceeds /Size");
});

test("/Index配列のfirstObjが非安全整数の場合にエラー", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 2, 1],
    size: Number.MAX_SAFE_INTEGER,
    index: [Number.MAX_SAFE_INTEGER + 1, 0],
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("/Index配列のcountが非整数の場合にエラー", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 2, 1],
    size: 10,
    index: [0, 1.5],
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("/Index配列のcountが非安全整数の場合にエラー", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 2, 1],
    size: Number.MAX_SAFE_INTEGER,
    index: [0, Number.MAX_SAFE_INTEGER + 1],
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("entryWidthやexpectedBytesのオーバーフローはフィールド幅上限で先に防止される", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({
    data,
    w: [Number.MAX_SAFE_INTEGER, 1, 0],
    size: 0,
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain("exceeds maximum 8 bytes");
});

test("totalEntries（各countの合計）が非安全整数の場合にエラー", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 2, 1],
    size: Number.MAX_SAFE_INTEGER,
    index: [0, Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER - 1, 2],
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("entryWidth=0 かつ totalEntries>0 の場合にエラー（CPU DoS防止）", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({
    data,
    w: [0, 0, 0],
    size: 100,
    index: [0, 100],
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain(
    "entry width is 0 but total entries is non-zero",
  );
});

test("Type 1 エントリで field3 (世代番号) が 65535 を超える場合 (65536) にエラー", () => {
  // W=[1, 2, 3], total width = 6
  // type=1, offset=10, gen=65536 (0x010000)
  const data = new Uint8Array([0x01, 0x00, 0x0a, 0x01, 0x00, 0x00]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 3], size: 1 });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain("Invalid GenerationNumber: 65536");
});

test("Type 1 エントリで field3 (世代番号) が 境界値 65535 の場合は正常にパースされる", () => {
  // W=[1, 2, 3], type=1, offset=10, gen=65535 (0x00FFFF)
  const data = new Uint8Array([0x01, 0x00, 0x0a, 0x00, 0xff, 0xff]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 2, 3],
    size: 2,
    index: [1, 1],
  });

  assert(result.ok);
  const entry = result.value.entries.get(ObjectNumber.of(1));
  assert(entry && entry.type === 1);
  expect(entry.generationNumber).toBe(GenerationNumber.of(65535));
});

test("Type 0 エントリで field3 (世代番号) が 65535 を超える場合 (65536) にエラー", () => {
  // W=[1, 2, 3], total width = 6
  // type=0, nextFreeObject=5, gen=65536 (0x010000)
  const data = new Uint8Array([0x00, 0x00, 0x05, 0x01, 0x00, 0x00]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 3], size: 1 });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain("Invalid GenerationNumber: 65536");
});

test("baseOffset 指定時に field3 (世代番号) エラーの offset が絶対オフセットになる", () => {
  // W=[1, 2, 3], total width = 6
  // type=1 (1 byte), offset=10 (2 bytes), gen=65536 (3 bytes)
  // field3 starts at offset 3 of the entry
  const data = new Uint8Array([0x01, 0x00, 0x0a, 0x01, 0x00, 0x00]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 2, 3],
    size: 1,
    baseOffset: ByteOffset.of(1000),
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.offset).toBe(ByteOffset.of(1003));
});

test("2番目のエントリで field3 エラー発生時に baseOffset + entryOffset + field3Offset の絶対オフセットが計算される", () => {
  // W=[1, 2, 3], total width = 6
  // entry 0: type=1, offset=10, gen=0 (正常)
  // entry 1: type=1, offset=10, gen=65536 (エラー: field3 offset = 6 + 3 = 9)
  const data = new Uint8Array([
    0x01,
    0x00,
    0x0a,
    0x00,
    0x00,
    0x00, // entry 0
    0x01,
    0x00,
    0x0a,
    0x01,
    0x00,
    0x00, // entry 1
  ]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 2, 3],
    size: 2,
    baseOffset: ByteOffset.of(1000),
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.offset).toBe(ByteOffset.of(1009));
});
