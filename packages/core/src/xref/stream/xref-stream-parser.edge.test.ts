import { expect, test } from "vitest";
import type { PdfParseError } from "../../errors/pdf-error";
import type { Err, Ok } from "../../result/result";
import { ByteOffset } from "../../types/byte-offset";
import { GenerationNumber } from "../../types/generation-number";
import type { XRefTable } from "../../types/index";
import { ObjectNumber } from "../../types/object-number";
import { decodeXRefStreamEntries } from "./xref-stream-parser";

test("空のストリーム（size=0, data長0）で空のXRefTableが返る", () => {
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 0 });

  expect(result.ok).toBe(true);
  const { value } = result as Ok<XRefTable>;
  expect(value.size).toBe(0);
  expect(value.entries.size).toBe(0);
});

test("単一エントリのみ", () => {
  const data = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 1 });

  expect(result.ok).toBe(true);
  const { value } = result as Ok<XRefTable>;
  expect(value.entries.size).toBe(1);
  expect(value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(0),
    generationNumber: GenerationNumber.of(0),
  });
});

test("4バイト幅フィールドで大きなオフセット値をデコードする", () => {
  // W=[1,4,2]: Type=1, offset=0x00FFFFFF (16777215), gen=0
  const data = new Uint8Array([0x01, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00]);
  const result = decodeXRefStreamEntries({ data, w: [1, 4, 2], size: 1 });

  expect(result.ok).toBe(true);
  const { value } = result as Ok<XRefTable>;
  expect(value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(16777215),
    generationNumber: GenerationNumber.of(0),
  });
});

test("W=[1,4,2] で大きなバイト幅の正しいデコード", () => {
  // Type=1, offset=0x01020304 (16909060), gen=0x0100 (256)
  const data = new Uint8Array([0x01, 0x01, 0x02, 0x03, 0x04, 0x01, 0x00]);
  const result = decodeXRefStreamEntries({ data, w: [1, 4, 2], size: 1 });

  expect(result.ok).toBe(true);
  const { value } = result as Ok<XRefTable>;
  expect(value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(16909060),
    generationNumber: GenerationNumber.of(256),
  });
});

test("decodeIntBEでNumber.MAX_SAFE_INTEGER超過時にエラー（7バイト以上のフィールド幅）", () => {
  // W=[1,7,0]: 7バイトフィールドで全0xFF → MAX_SAFE_INTEGER超過
  const data = new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  const result = decodeXRefStreamEntries({ data, w: [1, 7, 0], size: 1 });

  expect(result.ok).toBe(false);
  const { error } = result as Err<PdfParseError>;
  expect(error.code).toBe("XREF_STREAM_INVALID");
  expect(error.message).toContain("decoded integer exceeds safe integer range");
});

test("Type 2 の indexInStream が安全整数範囲内であることの検証", () => {
  // Type=2, streamObject=5, indexInStream=100
  const data = new Uint8Array([0x02, 0x00, 0x05, 0x64]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 1 });

  expect(result.ok).toBe(true);
  const { value } = result as Ok<XRefTable>;
  expect(value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 2,
    streamObject: ObjectNumber.of(5),
    indexInStream: 100,
  });
});

test("/Index範囲が重複した場合、後勝ちで上書きされる", () => {
  const data = new Uint8Array([
    0x01,
    0x00,
    0x0a,
    0x00, // 1st subsection: obj 0, offset=10
    0x01,
    0x00,
    0x14,
    0x00, // 2nd subsection: obj 0, offset=20 (上書き)
  ]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 2, 1],
    size: 1,
    index: [0, 1, 0, 1],
  });

  expect(result.ok).toBe(true);
  const { value } = result as Ok<XRefTable>;
  expect(value.entries.size).toBe(1);
  expect(value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(20),
    generationNumber: GenerationNumber.of(0),
  });
});

test("decodeIntBE: 幅0でデフォルト値0が返る（W=[0,0,0]で全フィールド0）", () => {
  // W=[0,0,0]: entryWidth=0, size=0 → 空テーブル
  const data = new Uint8Array([]);
  const result = decodeXRefStreamEntries({ data, w: [0, 0, 0], size: 0 });

  expect(result.ok).toBe(true);
  const { value } = result as Ok<XRefTable>;
  expect(value.entries.size).toBe(0);
});
