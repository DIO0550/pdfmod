import { expect, test } from "vitest";
import type { PdfObject } from "../../../pdf/types/pdf-types/index";
import { NumericPdfObject } from "./numeric-operand";

test.each<[string, PdfObject]>([
  ["integer 0", { type: "integer", value: 0 }],
  ["integer 正値", { type: "integer", value: 42 }],
  ["integer 負値", { type: "integer", value: -1 }],
  ["real 0", { type: "real", value: 0 }],
  ["real 小数", { type: "real", value: 1.5 }],
  ["real NaN (型のみ判定)", { type: "real", value: Number.NaN }],
])("NumericPdfObject.is は %s に対して true を返す", (_label, operand) => {
  expect(NumericPdfObject.is(operand)).toBe(true);
});

test.each<[string, PdfObject]>([
  ["null", { type: "null" }],
  ["boolean", { type: "boolean", value: true }],
  [
    "string",
    {
      type: "string",
      value: new Uint8Array([0x61]),
      encoding: "literal",
    },
  ],
  ["name", { type: "name", value: "Foo" }],
  ["array", { type: "array", elements: [] }],
  ["dictionary", { type: "dictionary", entries: new Map() }],
  [
    "indirect-ref",
    {
      type: "indirect-ref",
      objectNumber: 1,
      generationNumber: 0,
    },
  ],
])("NumericPdfObject.is は %s に対して false を返す", (_label, operand) => {
  expect(NumericPdfObject.is(operand)).toBe(false);
});
