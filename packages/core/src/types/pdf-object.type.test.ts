import { expect, test } from "vitest";
import type {
  PdfDictionary,
  PdfObject,
  TrailerDict,
  XRefEntry,
  XRefTable,
} from "./index.js";

test("PdfObjectの各バリアントを生成できる", () => {
  const nullObj: PdfObject = { type: "null" };
  const boolObj: PdfObject = { type: "boolean", value: true };
  const intObj: PdfObject = { type: "integer", value: 42 };
  const realObj: PdfObject = { type: "real", value: 3.14 };
  const strObj: PdfObject = {
    type: "string",
    value: new Uint8Array([72, 101]),
    encoding: "literal",
  };
  const nameObj: PdfObject = { type: "name", value: "Type" };
  const arrayObj: PdfObject = {
    type: "array",
    elements: [{ type: "integer", value: 1 }],
  };
  const dictObj: PdfObject = {
    type: "dictionary",
    entries: new Map([["Key", { type: "name", value: "Value" }]]),
  };
  const streamObj: PdfObject = {
    type: "stream",
    dictionary: {
      type: "dictionary",
      entries: new Map([["Length", { type: "integer", value: 44 }]]),
    },
    data: new Uint8Array([0, 1, 2]),
  };
  const refObj: PdfObject = {
    type: "indirect-ref",
    objectNumber: 5,
    generationNumber: 0,
  };

  expect(nullObj.type).toBe("null");
  expect(boolObj.type).toBe("boolean");
  expect(intObj.type).toBe("integer");
  expect(realObj.type).toBe("real");
  expect(strObj.type).toBe("string");
  expect(nameObj.type).toBe("name");
  expect(arrayObj.type).toBe("array");
  expect(dictObj.type).toBe("dictionary");
  expect(streamObj.type).toBe("stream");
  expect(refObj.type).toBe("indirect-ref");
});

test("typeフィールドでdiscriminated unionのナローイングが動作する", () => {
  const obj: PdfObject = { type: "integer", value: 42 };

  if (obj.type === "integer") {
    const n: number = obj.value;
    expect(n).toBe(42);
  }

  const dict: PdfObject = {
    type: "dictionary",
    entries: new Map(),
  };

  if (dict.type === "dictionary") {
    const entries: Map<string, PdfObject> = dict.entries;
    expect(entries.size).toBe(0);
  }
});

test("PdfDictionary型がdictionaryバリアントと一致する", () => {
  const dict: PdfDictionary = {
    type: "dictionary",
    entries: new Map(),
  };
  const obj: PdfObject = dict;

  expect(obj.type).toBe("dictionary");
  expect(dict.type).toBe("dictionary");
});

test("XRefEntryのtype: 0, 1, 2の各バリアントを生成できる", () => {
  const free: XRefEntry = { type: 0, field2: 1, field3: 65535 };
  const normal: XRefEntry = { type: 1, field2: 9, field3: 0 };
  const stream: XRefEntry = { type: 2, field2: 10, field3: 0 };

  expect(free.type).toBe(0);
  expect(normal.type).toBe(1);
  expect(stream.type).toBe(2);
});

test("XRefTableのentriesとsizeを持つオブジェクトを生成できる", () => {
  const table: XRefTable = {
    entries: new Map<number, XRefEntry>([
      [0, { type: 0, field2: 0, field3: 65535 }],
      [1, { type: 1, field2: 9, field3: 0 }],
    ]),
    size: 2,
  };

  expect(table.entries.size).toBe(2);
  expect(table.size).toBe(2);
});

test("TrailerDictの必須フィールドのみで生成できる", () => {
  const trailer: TrailerDict = {
    root: { objectNumber: 1, generationNumber: 0 },
    size: 6,
  };

  expect(trailer.root.objectNumber).toBe(1);
  expect(trailer.size).toBe(6);
});

test("TrailerDictのオプションフィールドを含めて生成できる", () => {
  const trailer: TrailerDict = {
    root: { objectNumber: 1, generationNumber: 0 },
    size: 6,
    prev: 408,
    info: { objectNumber: 5, generationNumber: 0 },
    id: [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])],
  };

  expect(trailer.prev).toBe(408);
  expect(trailer.info?.objectNumber).toBe(5);
  expect(trailer.id?.[0]).toBeInstanceOf(Uint8Array);
});

test("エントリポイントから全型がimportできる", async () => {
  const mod = await import("../index.js");
  expect(mod).toBeDefined();

  // Compile-time verification: types are importable from entry point
  const _check: import("../index.js").PdfObject = { type: "null" };
  const _check2: import("../index.js").PdfDictionary = {
    type: "dictionary",
    entries: new Map(),
  };
  const _check3: import("../index.js").XRefEntry = {
    type: 1,
    field2: 0,
    field3: 0,
  };
  const _check4: import("../index.js").XRefTable = {
    entries: new Map(),
    size: 0,
  };
  const _check5: import("../index.js").TrailerDict = {
    root: { objectNumber: 1, generationNumber: 0 },
    size: 1,
  };
  const _check6: import("../index.js").IndirectRef = {
    objectNumber: 1,
    generationNumber: 0,
  };
  expect(_check.type).toBe("null");
  expect(_check2.type).toBe("dictionary");
  expect(_check3.type).toBe(1);
  expect(_check4.size).toBe(0);
  expect(_check5.size).toBe(1);
  expect(_check6.objectNumber).toBe(1);
});
