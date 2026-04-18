import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../pdf/types/byte-offset/index";
import { GenerationNumber } from "../../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../../pdf/types/object-number/index";
import { decodeXRefStreamEntries } from "./index";

test("空のストリーム（size=0, data長0）で空のXRefTableが返る", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 0 });

  assert(result.ok);
  expect(result.value.size).toBe(0);
  expect(result.value.entries.size).toBe(0);
});

test("単一エントリのみ", () => {
  const data = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 1 });

  assert(result.ok);
  expect(result.value.entries.size).toBe(1);
  expect(result.value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(0),
    generationNumber: GenerationNumber.of(0),
  });
});

test("4バイト幅フィールドで大きなオフセット値をデコードする", () => {
  const data = new Uint8Array([0x01, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00]);
  const result = decodeXRefStreamEntries({ data, w: [1, 4, 2], size: 1 });

  assert(result.ok);
  expect(result.value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(16777215),
    generationNumber: GenerationNumber.of(0),
  });
});

test("W=[1,4,2] で大きなバイト幅の正しいデコード", () => {
  const data = new Uint8Array([0x01, 0x01, 0x02, 0x03, 0x04, 0x01, 0x00]);
  const result = decodeXRefStreamEntries({ data, w: [1, 4, 2], size: 1 });

  assert(result.ok);
  expect(result.value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(16909060),
    generationNumber: GenerationNumber.of(256),
  });
});

test("decodeIntBEでNumber.MAX_SAFE_INTEGER超過時にエラー（7バイト以上のフィールド幅）", () => {
  const data = new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  const result = decodeXRefStreamEntries({ data, w: [1, 7, 0], size: 1 });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain(
    "decoded integer exceeds safe integer range",
  );
});

test("Type 2 の indexInStream が安全整数範囲内であることの検証", () => {
  const data = new Uint8Array([0x02, 0x00, 0x05, 0x64]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 1 });

  assert(result.ok);
  expect(result.value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 2,
    streamObject: ObjectNumber.of(5),
    indexInStream: 100,
  });
});

test("/Index範囲が重複した場合、後勝ちで上書きされる", () => {
  const data = new Uint8Array([0x01, 0x00, 0x0a, 0x00, 0x01, 0x00, 0x14, 0x00]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 2, 1],
    size: 1,
    index: [0, 1, 0, 1],
  });

  assert(result.ok);
  expect(result.value.entries.size).toBe(1);
  expect(result.value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(20),
    generationNumber: GenerationNumber.of(0),
  });
});

test("decodeIntBE: 幅0でデフォルト値0が返る（W=[0,0,0]で全フィールド0）", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({ data, w: [0, 0, 0], size: 0 });

  assert(result.ok);
  expect(result.value.entries.size).toBe(0);
});

test("baseOffset 指定時にエラーの offset が絶対オフセットになる", () => {
  // W=[1,7,0]: 7バイトフィールドで全0xFF → MAX_SAFE_INTEGER超過
  // baseOffset=1000, field2 はエントリ先頭+1(w[0])の位置 → 期待offset=1001
  const data = new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 7, 0],
    size: 1,
    baseOffset: ByteOffset.of(1000),
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.offset).toBe(ByteOffset.of(1001));
});

test("baseOffset 省略時にエラーの offset がストリーム内位置になる", () => {
  const data = new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 7, 0],
    size: 1,
  });

  assert(!result.ok);
  expect(result.error.offset).toBe(ByteOffset.of(1));
});
