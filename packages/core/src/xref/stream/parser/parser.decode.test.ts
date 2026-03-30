import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../types/byte-offset/index";
import { GenerationNumber } from "../../../types/generation-number/index";
import { ObjectNumber } from "../../../types/object-number/index";
import { decodeXRefStreamEntries } from "./index";

test("W=[1,2,1] で Type 1 エントリ1件をデコードする", () => {
  const data = new Uint8Array([0x01, 0x00, 0x09, 0x00]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 1 });

  assert(result.ok);
  expect(result.value.size).toBe(1);
  expect(result.value.entries.size).toBe(1);
  expect(result.value.entries.get(ObjectNumber.of(0))).toEqual({
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

  assert(result.ok);
  expect(result.value.entries.size).toBe(3);
  expect(result.value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(9),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.entries.get(ObjectNumber.of(1))).toEqual({
    type: 1,
    offset: ByteOffset.of(74),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.entries.get(ObjectNumber.of(2))).toEqual({
    type: 1,
    offset: ByteOffset.of(120),
    generationNumber: GenerationNumber.of(0),
  });
});

test("Type 0（フリーオブジェクト）エントリをデコードする", () => {
  const data = new Uint8Array([0x00, 0x00, 0x05, 0x01]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 1 });

  assert(result.ok);
  expect(result.value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 0,
    nextFreeObject: ObjectNumber.of(5),
    generationNumber: GenerationNumber.of(1),
  });
});

test("Type 2（圧縮オブジェクト）エントリをデコードする", () => {
  const data = new Uint8Array([0x02, 0x00, 0x0a, 0x03]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 1 });

  assert(result.ok);
  expect(result.value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 2,
    streamObject: ObjectNumber.of(10),
    indexInStream: 3,
  });
});

test("Type 0/1/2 混在エントリをデコードする", () => {
  const data = new Uint8Array([
    0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x09, 0x00, 0x02, 0x00, 0x05, 0x02,
  ]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 3 });

  assert(result.ok);
  expect(result.value.entries.size).toBe(3);
  expect(result.value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 0,
    nextFreeObject: ObjectNumber.of(3),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.entries.get(ObjectNumber.of(1))).toEqual({
    type: 1,
    offset: ByteOffset.of(9),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.entries.get(ObjectNumber.of(2))).toEqual({
    type: 2,
    streamObject: ObjectNumber.of(5),
    indexInStream: 2,
  });
});

test("W[0]=0 のとき Type がデフォルト 1 になる", () => {
  const data = new Uint8Array([0x00, 0x09, 0x00]);
  const result = decodeXRefStreamEntries({ data, w: [0, 2, 1], size: 1 });

  assert(result.ok);
  expect(result.value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(9),
    generationNumber: GenerationNumber.of(0),
  });
});

test("W[1]=0 のとき Field2 が 0 としてデコードされる", () => {
  const data = new Uint8Array([0x01, 0x02]);
  const result = decodeXRefStreamEntries({ data, w: [1, 0, 1], size: 1 });

  assert(result.ok);
  expect(result.value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(0),
    generationNumber: GenerationNumber.of(2),
  });
});

test("W[2]=0 のとき Field3 がデフォルト 0 になる", () => {
  const data = new Uint8Array([0x01, 0x00, 0x64]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 0], size: 1 });

  assert(result.ok);
  expect(result.value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(100),
    generationNumber: GenerationNumber.of(0),
  });
});

test("W[0]=0 かつ W[2]=0 の組み合わせ", () => {
  const data = new Uint8Array([0x00, 0x32]);
  const result = decodeXRefStreamEntries({ data, w: [0, 2, 0], size: 1 });

  assert(result.ok);
  expect(result.value.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(50),
    generationNumber: GenerationNumber.of(0),
  });
});

test("/Index省略時にデフォルト [0, size] が適用される", () => {
  const data = new Uint8Array([0x01, 0x00, 0x09, 0x00, 0x01, 0x00, 0x4a, 0x00]);
  const result = decodeXRefStreamEntries({ data, w: [1, 2, 1], size: 2 });

  assert(result.ok);
  expect(result.value.entries.size).toBe(2);
  expect(result.value.entries.has(ObjectNumber.of(0))).toBe(true);
  expect(result.value.entries.has(ObjectNumber.of(1))).toBe(true);
});

test("/Index=[10, 3, 20, 2] で複数サブセクションをデコードする", () => {
  const data = new Uint8Array([
    0x01, 0x00, 0x0a, 0x00, 0x01, 0x00, 0x14, 0x00, 0x01, 0x00, 0x1e, 0x00,
    0x01, 0x00, 0x28, 0x00, 0x01, 0x00, 0x32, 0x00,
  ]);
  const result = decodeXRefStreamEntries({
    data,
    w: [1, 2, 1],
    size: 22,
    index: [10, 3, 20, 2],
  });

  assert(result.ok);
  expect(result.value.entries.size).toBe(5);
  expect(result.value.entries.get(ObjectNumber.of(10))).toEqual({
    type: 1,
    offset: ByteOffset.of(10),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.entries.get(ObjectNumber.of(12))).toEqual({
    type: 1,
    offset: ByteOffset.of(30),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.entries.get(ObjectNumber.of(21))).toEqual({
    type: 1,
    offset: ByteOffset.of(50),
    generationNumber: GenerationNumber.of(0),
  });
});
