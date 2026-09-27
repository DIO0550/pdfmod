import { expect, test } from "vitest";
import type { PdfObject } from "../index";
import { PdfName } from "../index";

test.each<[string, PdfObject]>([
  ["name 空文字", { type: "name", value: "" }],
  ["name 通常値", { type: "name", value: "F1" }],
])("PdfName.is は %s に対して true を返す", (_label, operand) => {
  expect(PdfName.is(operand)).toBe(true);
});

test.each<[string, PdfObject]>([
  ["null", { type: "null" }],
  ["boolean", { type: "boolean", value: true }],
  ["integer", { type: "integer", value: 1 }],
  ["real", { type: "real", value: 1.5 }],
  [
    "string",
    { type: "string", value: new Uint8Array([0x61]), encoding: "literal" },
  ],
  ["array", { type: "array", elements: [] }],
  ["dictionary", { type: "dictionary", entries: new Map() }],
  [
    "indirect-ref",
    { type: "indirect-ref", objectNumber: 1, generationNumber: 0 },
  ],
  [
    "stream",
    {
      type: "stream",
      dictionary: { type: "dictionary", entries: new Map() },
      data: new Uint8Array(),
    },
  ],
])("PdfName.is は %s に対して false を返す", (_label, operand) => {
  expect(PdfName.is(operand)).toBe(false);
});
