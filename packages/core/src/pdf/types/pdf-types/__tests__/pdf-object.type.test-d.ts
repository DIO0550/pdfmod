// packages/core/src/pdf/types/pdf-types/__tests__/pdf-object.type.test-d.ts

import { expectTypeOf, test } from "vitest";
import type {
  ByteOffset,
  GenerationNumber,
  IndirectRef,
  ObjectNumber,
  PdfDictionary,
  PdfIndirectObject,
  PdfObject,
  PdfStream,
  PdfValue,
  TrailerDict,
  XRefCompressedEntry,
  XRefEntry,
  XRefFreeEntry,
  XRefTable,
  XRefUsedEntry,
} from "../../../../index";

test("type フィールドで discriminated union が integer にナローイングできる", () => {
  expectTypeOf<Extract<PdfObject, { type: "integer" }>>().toEqualTypeOf<{
    type: "integer";
    value: number;
  }>();
});

test("type フィールドで discriminated union が dictionary にナローイングできる", () => {
  expectTypeOf<
    Extract<PdfObject, { type: "dictionary" }>
  >().toEqualTypeOf<PdfDictionary>();
});

test("PdfValue と PdfStream は PdfObject のサブタイプである", () => {
  expectTypeOf<PdfValue>().toExtend<PdfObject>();
  expectTypeOf<PdfStream>().toExtend<PdfObject>();
});

test("PdfStream は PdfValue に代入できない", () => {
  expectTypeOf<PdfStream>().not.toExtend<PdfValue>();
});

test("PdfArray の要素型は PdfValue に限定され PdfStream を含まない", () => {
  expectTypeOf<
    Extract<PdfValue, { type: "array" }>["elements"]
  >().toEqualTypeOf<PdfValue[]>();
  expectTypeOf<PdfStream>().not.toExtend<PdfValue>();
});

test("PdfDictionary の entries の値型は PdfValue に限定され PdfStream を含まない", () => {
  expectTypeOf<PdfDictionary["entries"]>().toEqualTypeOf<
    Map<string, PdfValue>
  >();
  expectTypeOf<PdfStream>().not.toExtend<PdfValue>();
});

test("PdfIndirectObject の body には PdfStream を入れられる", () => {
  expectTypeOf<PdfStream>().toExtend<PdfIndirectObject["body"]>();
});

test("XRefFreeEntry のフィールドが Brand 型で定義されている", () => {
  expectTypeOf<XRefFreeEntry["type"]>().toEqualTypeOf<0>();
  expectTypeOf<XRefFreeEntry["nextFreeObject"]>().toEqualTypeOf<ObjectNumber>();
  expectTypeOf<
    XRefFreeEntry["generationNumber"]
  >().toEqualTypeOf<GenerationNumber>();
});

test("XRefUsedEntry のフィールドが Brand 型で定義されている", () => {
  expectTypeOf<XRefUsedEntry["type"]>().toEqualTypeOf<1>();
  expectTypeOf<XRefUsedEntry["offset"]>().toEqualTypeOf<ByteOffset>();
  expectTypeOf<
    XRefUsedEntry["generationNumber"]
  >().toEqualTypeOf<GenerationNumber>();
});

test("XRefCompressedEntry のフィールドが Brand 型で定義されている", () => {
  expectTypeOf<XRefCompressedEntry["type"]>().toEqualTypeOf<2>();
  expectTypeOf<
    XRefCompressedEntry["streamObject"]
  >().toEqualTypeOf<ObjectNumber>();
  expectTypeOf<XRefCompressedEntry["indexInStream"]>().toEqualTypeOf<number>();
});

test("XRefEntry は3バリアントの union である", () => {
  expectTypeOf<XRefEntry>().toEqualTypeOf<
    XRefFreeEntry | XRefUsedEntry | XRefCompressedEntry
  >();
});

test("XRefTable の entries キーが ObjectNumber 型である", () => {
  expectTypeOf<XRefTable["entries"]>().toEqualTypeOf<
    Map<ObjectNumber, XRefEntry>
  >();
  expectTypeOf<XRefTable["size"]>().toEqualTypeOf<number>();
});

test("IndirectRef は ObjectNumber と GenerationNumber を必須で持つ", () => {
  expectTypeOf<IndirectRef["objectNumber"]>().toEqualTypeOf<ObjectNumber>();
  expectTypeOf<
    IndirectRef["generationNumber"]
  >().toEqualTypeOf<GenerationNumber>();
  expectTypeOf<{ objectNumber: ObjectNumber }>().not.toExtend<IndirectRef>();
});

test("TrailerDict は root と size のみ必須である", () => {
  expectTypeOf<{ root: IndirectRef; size: number }>().toExtend<TrailerDict>();
  expectTypeOf<TrailerDict["root"]>().toEqualTypeOf<IndirectRef>();
  expectTypeOf<TrailerDict["size"]>().toEqualTypeOf<number>();
});

test("TrailerDict.prev と xrefStm が省略可能な ByteOffset 型である", () => {
  expectTypeOf<TrailerDict["prev"]>().toEqualTypeOf<ByteOffset | undefined>();
  expectTypeOf<TrailerDict["xrefStm"]>().toEqualTypeOf<
    ByteOffset | undefined
  >();
});

test("TrailerDict のその他オプションフィールドの型が定義通りである", () => {
  expectTypeOf<TrailerDict["info"]>().toEqualTypeOf<IndirectRef | undefined>();
  expectTypeOf<TrailerDict["id"]>().toEqualTypeOf<
    [Uint8Array, Uint8Array] | undefined
  >();
  expectTypeOf<TrailerDict["encrypt"]>().toEqualTypeOf<
    IndirectRef | PdfDictionary | undefined
  >();
});
