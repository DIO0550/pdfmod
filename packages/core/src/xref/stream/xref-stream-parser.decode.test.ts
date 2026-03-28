import { expect, test } from "vitest";
import type { Ok } from "../../result/result";
import { ByteOffset } from "../../types/byte-offset";
import { GenerationNumber } from "../../types/generation-number";
import type { XRefTable } from "../../types/index";
import { ObjectNumber } from "../../types/object-number";
import { decodeXRefStreamEntries } from "./xref-stream-parser";

test("W=[1,2,1] で Type 1 エントリ1件をデコードする", () => {
  const data = new Uint8Array([0x01, 0x00, 0x09, 0x00]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 1 });

  expect(result.ok).toBe(true);
  const { value } = result as Ok<XRefTable>;
  expect(value.size).toBe(1);
  expect(value.entries.size).toBe(1);
  expect(value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(9),
    generationNumber: GenerationNumber.of(0),
  });
});

test("W=[1,2,1] で Type 1 エントリ3件をデコードする", () => {
  const data = new Uint8Array([
    0x01, 0x00, 0x09, 0x00, 0x01, 0x00, 0x4a, 0x00, 0x01, 0x00, 0x78, 0x00,
  ]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 3 });

  expect(result.ok).toBe(true);
  const { value } = result as Ok<XRefTable>;
  expect(value.entries.size).toBe(3);
  expect(value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(9),
    generationNumber: GenerationNumber.of(0),
  });
  expect(value.entries.get(ObjectNumber.of(1))).toEqual({
    type: 1,
    offset: ByteOffset.of(74),
    generationNumber: GenerationNumber.of(0),
  });
  expect(value.entries.get(ObjectNumber.of(2))).toEqual({
    type: 1,
    offset: ByteOffset.of(120),
    generationNumber: GenerationNumber.of(0),
  });
});

test("Type 0（フリーオブジェクト）エントリをデコードする", () => {
  // Type=0, nextFreeObject=5, gen=1
  const data = new Uint8Array([0x00, 0x00, 0x05, 0x01]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 1 });

  expect(result.ok).toBe(true);
  const { value } = result as Ok<XRefTable>;
  expect(value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 0,
    nextFreeObject: ObjectNumber.of(5),
    generationNumber: GenerationNumber.of(1),
  });
});

test("Type 2（圧縮オブジェクト）エントリをデコードする", () => {
  // Type=2, streamObject=10, indexInStream=3
  const data = new Uint8Array([0x02, 0x00, 0x0a, 0x03]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 1 });

  expect(result.ok).toBe(true);
  const { value } = result as Ok<XRefTable>;
  expect(value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 2,
    streamObject: ObjectNumber.of(10),
    indexInStream: 3,
  });
});

test("Type 0/1/2 混在エントリをデコードする", () => {
  const data = new Uint8Array([
    0x00,
    0x00,
    0x03,
    0x00, // obj 0: Type=0, nextFree=3, gen=0
    0x01,
    0x00,
    0x09,
    0x00, // obj 1: Type=1, offset=9, gen=0
    0x02,
    0x00,
    0x05,
    0x02, // obj 2: Type=2, streamObj=5, indexInStream=2
  ]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 3 });

  expect(result.ok).toBe(true);
  const { value } = result as Ok<XRefTable>;
  expect(value.entries.size).toBe(3);
  expect(value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 0,
    nextFreeObject: ObjectNumber.of(3),
    generationNumber: GenerationNumber.of(0),
  });
  expect(value.entries.get(ObjectNumber.of(1))).toEqual({
    type: 1,
    offset: ByteOffset.of(9),
    generationNumber: GenerationNumber.of(0),
  });
  expect(value.entries.get(ObjectNumber.of(2))).toEqual({
    type: 2,
    streamObject: ObjectNumber.of(5),
    indexInStream: 2,
  });
});

test("W[0]=0 のとき Type がデフォルト 1 になる", () => {
  // W=[0,2,1]: Typeフィールド省略→デフォルト1, offset=9, gen=0
  const data = new Uint8Array([0x00, 0x09, 0x00]);
  const result = decodeXRefStreamEntries({ data, w: [0, 2, 1], size: 1 });

  expect(result.ok).toBe(true);
  const { value } = result as Ok<XRefTable>;
  expect(value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(9),
    generationNumber: GenerationNumber.of(0),
  });
});

test("W[1]=0 のとき Field2 が 0 としてデコードされる", () => {
  // W=[1,0,1]: Field2省略→0, Type=1→offset=0, gen=2
  const data = new Uint8Array([0x01, 0x02]);
  const result = decodeXRefStreamEntries({ data, w: [1, 0, 1], size: 1 });

  expect(result.ok).toBe(true);
  const { value } = result as Ok<XRefTable>;
  expect(value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(0),
    generationNumber: GenerationNumber.of(2),
  });
});

test("W[2]=0 のとき Field3 がデフォルト 0 になる", () => {
  // W=[1,2,0]: Field3省略→0, Type=1, offset=100
  const data = new Uint8Array([0x01, 0x00, 0x64]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 0], size: 1 });

  expect(result.ok).toBe(true);
  const { value } = result as Ok<XRefTable>;
  expect(value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(100),
    generationNumber: GenerationNumber.of(0),
  });
});

test("W[0]=0 かつ W[2]=0 の組み合わせ", () => {
  // W=[0,2,0]: Type=1(デフォルト), offset=50, gen=0(デフォルト)
  const data = new Uint8Array([0x00, 0x32]);
  const result = decodeXRefStreamEntries({ data, w: [0, 2, 0], size: 1 });

  expect(result.ok).toBe(true);
  const { value } = result as Ok<XRefTable>;
  expect(value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(50),
    generationNumber: GenerationNumber.of(0),
  });
});

test("/Index省略時にデフォルト [0, size] が適用される", () => {
  const data = new Uint8Array([0x01, 0x00, 0x09, 0x00, 0x01, 0x00, 0x4a, 0x00]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 2 });

  expect(result.ok).toBe(true);
  const { value } = result as Ok<XRefTable>;
  expect(value.entries.size).toBe(2);
  expect(value.entries.has(ObjectNumber.of(0))).toBe(true);
  expect(value.entries.has(ObjectNumber.of(1))).toBe(true);
});

test("/Index=[10, 3, 20, 2] で複数サブセクションをデコードする", () => {
  const data = new Uint8Array([
    0x01,
    0x00,
    0x0a,
    0x00, // obj 10: Type=1, offset=10, gen=0
    0x01,
    0x00,
    0x14,
    0x00, // obj 11: Type=1, offset=20, gen=0
    0x01,
    0x00,
    0x1e,
    0x00, // obj 12: Type=1, offset=30, gen=0
    0x01,
    0x00,
    0x28,
    0x00, // obj 20: Type=1, offset=40, gen=0
    0x01,
    0x00,
    0x32,
    0x00, // obj 21: Type=1, offset=50, gen=0
  ]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 2, 1],
    size: 22,
    index: [10, 3, 20, 2],
  });

  expect(result.ok).toBe(true);
  const { value } = result as Ok<XRefTable>;
  expect(value.entries.size).toBe(5);
  expect(value.entries.get(ObjectNumber.of(10))).toEqual({
    type: 1,
    offset: ByteOffset.of(10),
    generationNumber: GenerationNumber.of(0),
  });
  expect(value.entries.get(ObjectNumber.of(12))).toEqual({
    type: 1,
    offset: ByteOffset.of(30),
    generationNumber: GenerationNumber.of(0),
  });
  expect(value.entries.get(ObjectNumber.of(21))).toEqual({
    type: 1,
    offset: ByteOffset.of(50),
    generationNumber: GenerationNumber.of(0),
  });
});
