import { expect, test } from "vitest";
import { ByteOffset } from "./byte-offset";
import { GenerationNumber } from "./generation-number";
import type {
  IndirectRef,
  PdfDictionary,
  PdfObject,
  TrailerDict,
  XRefCompressedEntry,
  XRefEntry,
  XRefFreeEntry,
  XRefTable,
  XRefUsedEntry,
} from "./index";
import { ObjectNumber } from "./object-number";

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

  // @ts-expect-error - verifying narrowing works via conditional
  const _narrowing_test: never = obj.type === "integer" ? undefined : obj;
  expect(_narrowing_test).toBeUndefined();

  const dict: PdfObject = {
    type: "dictionary",
    entries: new Map(),
  };

  // @ts-expect-error - verifying narrowing works via conditional
  const _narrowing_test2: never = dict.type === "dictionary" ? undefined : dict;
  expect(_narrowing_test2).toBeUndefined();
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

test("XRefFreeEntry を構築できる", () => {
  const free: XRefFreeEntry = {
    type: 0,
    nextFreeObject: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(65535),
  };
  expect(free.type).toBe(0);
  expect(free.nextFreeObject).toBe(1);
  expect(free.generationNumber).toBe(65535);
});

test("XRefUsedEntry を構築できる", () => {
  const used: XRefUsedEntry = {
    type: 1,
    offset: ByteOffset.of(9),
    generationNumber: GenerationNumber.of(0),
  };
  expect(used.type).toBe(1);
  expect(used.offset).toBe(9);
  expect(used.generationNumber).toBe(0);
});

test("XRefCompressedEntry を構築できる", () => {
  const compressed: XRefCompressedEntry = {
    type: 2,
    streamObject: ObjectNumber.of(10),
    indexInStream: 0,
  };
  expect(compressed.type).toBe(2);
  expect(compressed.streamObject).toBe(10);
  expect(compressed.indexInStream).toBe(0);
});

test("XRefEntry は3バリアントの union である", () => {
  const free: XRefEntry = {
    type: 0,
    nextFreeObject: ObjectNumber.of(0),
    generationNumber: GenerationNumber.of(65535),
  };
  const used: XRefEntry = {
    type: 1,
    offset: ByteOffset.of(1024),
    generationNumber: GenerationNumber.of(0),
  };
  const compressed: XRefEntry = {
    type: 2,
    streamObject: ObjectNumber.of(10),
    indexInStream: 0,
  };
  expect(free.type).toBe(0);
  expect(used.type).toBe(1);
  expect(compressed.type).toBe(2);
});

test("XRefTable の entries キーが ObjectNumber 型である", () => {
  const table: XRefTable = {
    entries: new Map<ObjectNumber, XRefEntry>([
      [
        ObjectNumber.of(0),
        {
          type: 0,
          nextFreeObject: ObjectNumber.of(0),
          generationNumber: GenerationNumber.of(65535),
        },
      ],
      [
        ObjectNumber.of(1),
        {
          type: 1,
          offset: ByteOffset.of(9),
          generationNumber: GenerationNumber.of(0),
        },
      ],
    ]),
    size: 2,
  };
  expect(table.entries.size).toBe(2);
  expect(table.size).toBe(2);
});

test("IndirectRef 構築時に ObjectNumber / GenerationNumber が必要", () => {
  const ref: IndirectRef = {
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
  };
  expect(ref.objectNumber).toBe(1);
  expect(ref.generationNumber).toBe(0);
});

test("TrailerDictの必須フィールドのみで生成できる", () => {
  const trailer: TrailerDict = {
    root: {
      objectNumber: ObjectNumber.of(1),
      generationNumber: GenerationNumber.of(0),
    },
    size: 6,
  };
  expect(trailer.root.objectNumber).toBe(1);
  expect(trailer.size).toBe(6);
});

test("TrailerDictのオプションフィールドを含めて生成できる", () => {
  const trailer: TrailerDict = {
    root: {
      objectNumber: ObjectNumber.of(1),
      generationNumber: GenerationNumber.of(0),
    },
    size: 6,
    prev: ByteOffset.of(408),
    info: {
      objectNumber: ObjectNumber.of(5),
      generationNumber: GenerationNumber.of(0),
    },
    id: [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])],
  };
  expect(trailer.prev).toBe(408);
  expect(trailer.info?.objectNumber).toBe(5);
  expect(trailer.id?.[0]).toBeInstanceOf(Uint8Array);
});

test("TrailerDict.prev が ByteOffset 型", () => {
  const trailer: TrailerDict = {
    root: {
      objectNumber: ObjectNumber.of(1),
      generationNumber: GenerationNumber.of(0),
    },
    size: 6,
    prev: ByteOffset.of(100),
  };
  const prev: ByteOffset | undefined = trailer.prev;
  expect(prev).toBe(100);
});

test("エントリポイントから全型がimportできる", async () => {
  const mod = await import("../index");
  expect(mod).toBeDefined();

  const _check: import("../index").PdfObject = { type: "null" };
  const _check2: import("../index").PdfDictionary = {
    type: "dictionary",
    entries: new Map(),
  };
  const _check3: import("../index").XRefEntry = {
    type: 1,
    offset: ByteOffset.of(0),
    generationNumber: GenerationNumber.of(0),
  };
  const _check4: import("../index").XRefTable = {
    entries: new Map(),
    size: 0,
  };
  const _check5: import("../index").TrailerDict = {
    root: {
      objectNumber: ObjectNumber.of(1),
      generationNumber: GenerationNumber.of(0),
    },
    size: 1,
  };
  const _check6: import("../index").IndirectRef = {
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
  };
  expect(_check.type).toBe("null");
  expect(_check2.type).toBe("dictionary");
  expect(_check3.type).toBe(1);
  expect(_check4.size).toBe(0);
  expect(_check5.size).toBe(1);
  expect(_check6.objectNumber).toBe(1);
});
