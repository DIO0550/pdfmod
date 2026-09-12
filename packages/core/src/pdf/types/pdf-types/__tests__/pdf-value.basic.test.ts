import { expect, test } from "vitest";
import { none, some } from "../../../../utils/option/index";
import { PdfValue } from "../index";

test.each<[string, PdfValue, number]>([
  ["integer", { type: "integer", value: 42 }, 42],
  ["integer 負値", { type: "integer", value: -7 }, -7],
  ["real", { type: "real", value: 3.14 }, 3.14],
  ["real 0", { type: "real", value: 0 }, 0],
])("PdfValue.asNumber は %s に対して some(number) を返す", (_label, value, expected) => {
  expect(PdfValue.asNumber(value)).toEqual(some(expected));
});

test.each<[string, PdfValue | undefined]>([
  ["undefined", undefined],
  ["null", { type: "null" }],
  ["boolean", { type: "boolean", value: true }],
  [
    "string",
    { type: "string", value: new Uint8Array([0x61]), encoding: "literal" },
  ],
  ["name", { type: "name", value: "Foo" }],
  ["array", { type: "array", elements: [] }],
  ["dictionary", { type: "dictionary", entries: new Map() }],
  [
    "indirect-ref",
    { type: "indirect-ref", objectNumber: 1, generationNumber: 0 },
  ],
])("PdfValue.asNumber は %s に対して none を返す", (_label, value) => {
  expect(PdfValue.asNumber(value)).toEqual(none);
});
