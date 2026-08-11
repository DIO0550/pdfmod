// packages/core/src/pdf/types/pdf-types/__tests__/pdf-types.type-export.test-d.ts

import { expectTypeOf, test } from "vitest";
import type {
  PdfArray,
  PdfBoolean,
  PdfDictionary,
  PdfIndirectObject,
  PdfIndirectRef,
  PdfInteger,
  PdfName,
  PdfNull,
  PdfObject,
  PdfReal,
  PdfStream,
  PdfString,
  PdfValue,
} from "../../../../index";
import type { GenerationNumber } from "../../generation-number/index";
import type { ObjectNumber } from "../../object-number/index";

test("PdfValue は9バリアントの union でありルートから参照できる", () => {
  expectTypeOf<PdfValue>().toEqualTypeOf<
    | PdfNull
    | PdfBoolean
    | PdfInteger
    | PdfReal
    | PdfString
    | PdfName
    | PdfArray
    | PdfDictionary
    | PdfIndirectRef
  >();
});

test("PdfObject は PdfValue と PdfStream の union である", () => {
  expectTypeOf<PdfObject>().toEqualTypeOf<PdfValue | PdfStream>();
});

test("PdfStream がルートから参照でき dictionary と data の型が定義通りである", () => {
  expectTypeOf<PdfStream["type"]>().toEqualTypeOf<"stream">();
  expectTypeOf<PdfStream["dictionary"]>().toEqualTypeOf<PdfDictionary>();
  expectTypeOf<PdfStream["data"]>().toEqualTypeOf<Uint8Array>();
});

test("PdfIndirectObject がルートから参照でき Brand 型の識別子を持つ", () => {
  expectTypeOf<
    PdfIndirectObject["objectNumber"]
  >().toEqualTypeOf<ObjectNumber>();
  expectTypeOf<
    PdfIndirectObject["generationNumber"]
  >().toEqualTypeOf<GenerationNumber>();
  expectTypeOf<PdfIndirectObject["body"]>().toEqualTypeOf<PdfObject>();
});

test("PdfDictionary の entries は string キー・PdfValue 値の Map である", () => {
  expectTypeOf<PdfDictionary["entries"]>().toEqualTypeOf<
    Map<string, PdfValue>
  >();
});

test("各バリアントのタグと値の型が定義通りである", () => {
  expectTypeOf<PdfNull>().toEqualTypeOf<{ type: "null" }>();
  expectTypeOf<PdfBoolean["value"]>().toEqualTypeOf<boolean>();
  expectTypeOf<PdfInteger["value"]>().toEqualTypeOf<number>();
  expectTypeOf<PdfReal["value"]>().toEqualTypeOf<number>();
  expectTypeOf<PdfString["value"]>().toEqualTypeOf<Uint8Array>();
  expectTypeOf<PdfString["encoding"]>().toEqualTypeOf<"literal" | "hex">();
  expectTypeOf<PdfName["value"]>().toEqualTypeOf<string>();
  expectTypeOf<PdfArray["elements"]>().toEqualTypeOf<PdfValue[]>();
});

test("PdfIndirectRef の番号は Brand 型ではなく素の number である", () => {
  expectTypeOf<PdfIndirectRef["objectNumber"]>().toEqualTypeOf<number>();
  expectTypeOf<PdfIndirectRef["generationNumber"]>().toEqualTypeOf<number>();
});
