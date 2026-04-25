import { expect, test } from "vitest";
import { GenerationNumber } from "../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../pdf/types/object-number/index";
import type { PdfValue } from "../../pdf/types/pdf-types/index";
import { DictReader } from "./dict-reader";
import { indirectRefValue } from "./page-tree-walker.test.helpers";

const integerArray = (values: number[]): PdfValue => ({
  type: "array",
  elements: values.map((v) => ({ type: "integer", value: v })),
});

test("DictReader.box はキーが存在しないとき None を返す", () => {
  const entries = new Map<string, PdfValue>();
  expect(DictReader.box(entries, "MediaBox")).toEqual({ some: false });
});

test("DictReader.box は値が非配列のとき None を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["MediaBox", { type: "integer", value: 0 }],
  ]);
  expect(DictReader.box(entries, "MediaBox")).toEqual({ some: false });
});

test("DictReader.box は要素数が 4 でないとき None を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["MediaBox", integerArray([0, 0, 100])],
  ]);
  expect(DictReader.box(entries, "MediaBox")).toEqual({ some: false });
});

test("DictReader.box は要素に非数値が混入するとき None を返す", () => {
  const entries = new Map<string, PdfValue>([
    [
      "MediaBox",
      {
        type: "array",
        elements: [
          { type: "integer", value: 0 },
          { type: "integer", value: 0 },
          { type: "name", value: "Foo" },
          { type: "integer", value: 100 },
        ],
      },
    ],
  ]);
  expect(DictReader.box(entries, "MediaBox")).toEqual({ some: false });
});

test("DictReader.box は integer 4 要素のとき Some を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["MediaBox", integerArray([0, 0, 612, 792])],
  ]);
  expect(DictReader.box(entries, "MediaBox")).toEqual({
    some: true,
    value: [0, 0, 612, 792],
  });
});

test("DictReader.box は real 混在 4 要素のとき Some を返す", () => {
  const entries = new Map<string, PdfValue>([
    [
      "CropBox",
      {
        type: "array",
        elements: [
          { type: "integer", value: 0 },
          { type: "real", value: 0.5 },
          { type: "real", value: 612.25 },
          { type: "integer", value: 792 },
        ],
      },
    ],
  ]);
  expect(DictReader.box(entries, "CropBox")).toEqual({
    some: true,
    value: [0, 0.5, 612.25, 792],
  });
});

test("DictReader.rotate はキー不在で None を返す", () => {
  expect(DictReader.rotate(new Map<string, PdfValue>())).toEqual({
    some: false,
  });
});

test("DictReader.rotate は名前のとき None を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Rotate", { type: "name", value: "Foo" }],
  ]);
  expect(DictReader.rotate(entries)).toEqual({ some: false });
});

test("DictReader.rotate は文字列のとき None を返す", () => {
  const entries = new Map<string, PdfValue>([
    [
      "Rotate",
      {
        type: "string",
        value: new Uint8Array([0x41]),
        encoding: "literal",
      },
    ],
  ]);
  expect(DictReader.rotate(entries)).toEqual({ some: false });
});

test("DictReader.rotate は boolean のとき None を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Rotate", { type: "boolean", value: true }],
  ]);
  expect(DictReader.rotate(entries)).toEqual({ some: false });
});

test("DictReader.rotate は integer 90 で Some(90) を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Rotate", { type: "integer", value: 90 }],
  ]);
  expect(DictReader.rotate(entries)).toEqual({ some: true, value: 90 });
});

test("DictReader.rotate は real 45.5 で Some(45.5) を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Rotate", { type: "real", value: 45.5 }],
  ]);
  expect(DictReader.rotate(entries)).toEqual({ some: true, value: 45.5 });
});

test("DictReader.userUnit はキー不在で 1.0 を返す", () => {
  expect(DictReader.userUnit(new Map<string, PdfValue>())).toBe(1.0);
});

test("DictReader.userUnit は 0 で 1.0 を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["UserUnit", { type: "real", value: 0 }],
  ]);
  expect(DictReader.userUnit(entries)).toBe(1.0);
});

test("DictReader.userUnit は負数で 1.0 を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["UserUnit", { type: "real", value: -2 }],
  ]);
  expect(DictReader.userUnit(entries)).toBe(1.0);
});

test("DictReader.userUnit は Infinity で 1.0 を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["UserUnit", { type: "real", value: Number.POSITIVE_INFINITY }],
  ]);
  expect(DictReader.userUnit(entries)).toBe(1.0);
});

test("DictReader.userUnit は 2.5 で 2.5 を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["UserUnit", { type: "real", value: 2.5 }],
  ]);
  expect(DictReader.userUnit(entries)).toBe(2.5);
});

test("DictReader.contents はキー不在で null を返す", () => {
  expect(DictReader.contents(new Map<string, PdfValue>())).toBeNull();
});

test("DictReader.contents は単一 indirect-ref 正常で IndirectRef を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Contents", indirectRefValue(5, 0)],
  ]);
  expect(DictReader.contents(entries)).toEqual({
    objectNumber: ObjectNumber.of(5),
    generationNumber: GenerationNumber.of(0),
  });
});

test("DictReader.contents は単一 indirect-ref 不正 objectNumber で null を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Contents", indirectRefValue(0, 0)],
  ]);
  expect(DictReader.contents(entries)).toBeNull();
});

test("DictReader.contents は配列（正常 ref のみ）で IndirectRef 配列を返す", () => {
  const entries = new Map<string, PdfValue>([
    [
      "Contents",
      {
        type: "array",
        elements: [indirectRefValue(1, 0), indirectRefValue(2, 0)],
      },
    ],
  ]);
  expect(DictReader.contents(entries)).toEqual([
    {
      objectNumber: ObjectNumber.of(1),
      generationNumber: GenerationNumber.of(0),
    },
    {
      objectNumber: ObjectNumber.of(2),
      generationNumber: GenerationNumber.of(0),
    },
  ]);
});

test("DictReader.contents は配列（不正 ref 混入）で正常分のみの配列を返す", () => {
  const entries = new Map<string, PdfValue>([
    [
      "Contents",
      {
        type: "array",
        elements: [
          indirectRefValue(1, 0),
          indirectRefValue(0, 0),
          indirectRefValue(3, 0),
        ],
      },
    ],
  ]);
  expect(DictReader.contents(entries)).toEqual([
    {
      objectNumber: ObjectNumber.of(1),
      generationNumber: GenerationNumber.of(0),
    },
    {
      objectNumber: ObjectNumber.of(3),
      generationNumber: GenerationNumber.of(0),
    },
  ]);
});

test("DictReader.contents は配列（非 ref 要素混入）で正常 ref のみの配列を返す", () => {
  const entries = new Map<string, PdfValue>([
    [
      "Contents",
      {
        type: "array",
        elements: [
          indirectRefValue(7, 0),
          { type: "integer", value: 100 },
          indirectRefValue(8, 0),
        ],
      },
    ],
  ]);
  expect(DictReader.contents(entries)).toEqual([
    {
      objectNumber: ObjectNumber.of(7),
      generationNumber: GenerationNumber.of(0),
    },
    {
      objectNumber: ObjectNumber.of(8),
      generationNumber: GenerationNumber.of(0),
    },
  ]);
});

test("DictReader.contents は非配列・非 ref で null を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Contents", { type: "integer", value: 100 }],
  ]);
  expect(DictReader.contents(entries)).toBeNull();
});

test("DictReader.annots はキー不在で null を返す", () => {
  expect(DictReader.annots(new Map<string, PdfValue>())).toBeNull();
});

test("DictReader.annots は非配列で null を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Annots", { type: "integer", value: 1 }],
  ]);
  expect(DictReader.annots(entries)).toBeNull();
});

test("DictReader.annots は空配列で空配列を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Annots", { type: "array", elements: [] }],
  ]);
  expect(DictReader.annots(entries)).toEqual([]);
});

test("DictReader.annots は要素付き配列で複製された配列を返す", () => {
  const elements: PdfValue[] = [
    { type: "integer", value: 1 },
    { type: "integer", value: 2 },
  ];
  const entries = new Map<string, PdfValue>([
    ["Annots", { type: "array", elements }],
  ]);
  const got = DictReader.annots(entries);
  expect(got).toEqual(elements);
  expect(got).not.toBe(elements);
});
