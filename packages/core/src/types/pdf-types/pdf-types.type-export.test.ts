import { expect, test } from "vitest";
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
} from "../../index";
import { GenerationNumber } from "../generation-number/index";
import { ObjectNumber } from "../object-number/index";

test("PdfValue / PdfObject / PdfStream / PdfIndirectObject がルートから import できる", () => {
  const v: PdfValue = { type: "integer", value: 1 };
  const obj: PdfObject = v;
  const s: PdfStream = {
    type: "stream",
    dictionary: { type: "dictionary", entries: new Map() },
    data: new Uint8Array(),
  };
  const objWithStream: PdfObject = s;
  const d: PdfDictionary = { type: "dictionary", entries: new Map() };
  const indirect: PdfIndirectObject = {
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
    body: v,
  };
  expect([v, obj, s, objWithStream, d, indirect]).toBeDefined();
});

test("各バリアント interface がルートから import できる", () => {
  const nullV: PdfNull = { type: "null" };
  const boolV: PdfBoolean = { type: "boolean", value: true };
  const intV: PdfInteger = { type: "integer", value: 1 };
  const realV: PdfReal = { type: "real", value: 1.5 };
  const strV: PdfString = {
    type: "string",
    value: new Uint8Array(),
    encoding: "literal",
  };
  const nameV: PdfName = { type: "name", value: "X" };
  const arrV: PdfArray = { type: "array", elements: [] };
  const refV: PdfIndirectRef = {
    type: "indirect-ref",
    objectNumber: 1,
    generationNumber: 0,
  };
  expect([nullV, boolV, intV, realV, strV, nameV, arrV, refV]).toHaveLength(8);
});
