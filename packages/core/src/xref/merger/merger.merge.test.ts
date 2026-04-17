import { assert, expect, test } from "vitest";
import type { PdfParseError } from "../../errors/index";
import { ByteOffset } from "../../types/byte-offset/index";
import { GenerationNumber } from "../../types/generation-number/index";
import type { TrailerDict, XRefEntry, XRefTable } from "../../types/index";
import { ObjectNumber } from "../../types/object-number/index";
import type { Result } from "../../utils/result/index";
import { err, ok } from "../../utils/result/index";
import { mergeXRefChain } from "./index";

const dummyRoot = {
  objectNumber: ObjectNumber.of(1),
  generationNumber: GenerationNumber.of(0),
};

function usedEntry(offset: number, gen = 0): XRefEntry {
  return {
    type: 1,
    offset: ByteOffset.of(offset),
    generationNumber: GenerationNumber.of(gen),
  };
}

function freeEntry(nextFree: number, gen = 0): XRefEntry {
  return {
    type: 0,
    nextFreeObject: ObjectNumber.of(nextFree),
    generationNumber: GenerationNumber.of(gen),
  };
}

function compressedEntry(streamObj: number, index: number): XRefEntry {
  return {
    type: 2,
    streamObject: ObjectNumber.of(streamObj),
    indexInStream: index,
  };
}

function makeXRef(
  entries: Array<[number, XRefEntry]>,
  size: number,
): XRefTable {
  return {
    entries: new Map(entries.map(([n, e]) => [ObjectNumber.of(n), e])),
    size,
  };
}

function makeTrailer(size: number, prev?: number): TrailerDict {
  return {
    root: dummyRoot,
    size,
    prev: prev !== undefined ? ByteOffset.of(prev) : undefined,
  };
}

type ParseCallback = (
  offset: ByteOffset,
) => Result<{ xref: XRefTable; trailer: TrailerDict }, PdfParseError>;

function stubMap(
  entries: Array<[number, { xref: XRefTable; trailer: TrailerDict }]>,
): Map<ByteOffset, { xref: XRefTable; trailer: TrailerDict }> {
  return new Map(entries.map(([n, v]) => [ByteOffset.of(n), v]));
}

function callbackFromMap(
  table: Map<ByteOffset, { xref: XRefTable; trailer: TrailerDict }>,
): ParseCallback {
  return (offset: ByteOffset) => {
    const entry = table.get(offset);
    return entry
      ? ok(entry)
      : err({
          code: "XREF_TABLE_INVALID" as const,
          message: "unexpected offset",
        });
  };
}

test("単一xref（/Prevなし）: コールバック1回呼び出し、そのままのXRefTableとTrailerDictが返る", () => {
  const xref = makeXRef(
    [
      [0, freeEntry(0, 65535)],
      [1, usedEntry(100)],
    ],
    2,
  );
  const trailer = makeTrailer(2);
  const callback = callbackFromMap(stubMap([[500, { xref, trailer }]]));

  const result = mergeXRefChain(ByteOffset.of(500), callback);

  assert(result.ok);
  expect(result.value.mergedXRef.entries.size).toBe(2);
  expect(result.value.mergedXRef.size).toBe(2);
  expect(result.value.latestTrailer.root).toEqual(dummyRoot);
  expect(result.value.latestTrailer.size).toBe(2);
});

test("2段チェーン: 新しいエントリが古いエントリを上書きする", () => {
  const oldXRef = makeXRef(
    [
      [0, freeEntry(0, 65535)],
      [1, usedEntry(100)],
    ],
    2,
  );
  const newXRef = makeXRef(
    [
      [1, usedEntry(200)],
      [2, usedEntry(300)],
    ],
    3,
  );
  const callback = callbackFromMap(
    stubMap([
      [500, { xref: newXRef, trailer: makeTrailer(3, 100) }],
      [100, { xref: oldXRef, trailer: makeTrailer(2) }],
    ]),
  );

  const result = mergeXRefChain(ByteOffset.of(500), callback);

  assert(result.ok);
  expect(result.value.mergedXRef.entries.size).toBe(3);
  const entry1 = result.value.mergedXRef.entries.get(ObjectNumber.of(1));
  assert(entry1 !== undefined && entry1.type === 1);
  expect(entry1.offset).toBe(200);
  expect(result.value.latestTrailer.root).toEqual(dummyRoot);
});

test("3段チェーン: 古い順にマージされ、最新が優先", () => {
  const callback = callbackFromMap(
    stubMap([
      [
        300,
        {
          xref: makeXRef(
            [
              [2, usedEntry(40)],
              [3, usedEntry(50)],
            ],
            8,
          ),
          trailer: makeTrailer(8, 200),
        },
      ],
      [
        200,
        {
          xref: makeXRef(
            [
              [1, usedEntry(20)],
              [2, usedEntry(30)],
            ],
            10,
          ),
          trailer: makeTrailer(10, 50),
        },
      ],
      [
        50,
        { xref: makeXRef([[1, usedEntry(10)]], 5), trailer: makeTrailer(5) },
      ],
    ]),
  );

  const result = mergeXRefChain(ByteOffset.of(300), callback);

  assert(result.ok);
  const entry1 = result.value.mergedXRef.entries.get(ObjectNumber.of(1));
  assert(entry1 !== undefined && entry1.type === 1);
  expect(entry1.offset).toBe(20);

  const entry2 = result.value.mergedXRef.entries.get(ObjectNumber.of(2));
  assert(entry2 !== undefined && entry2.type === 1);
  expect(entry2.offset).toBe(40);

  const entry3 = result.value.mergedXRef.entries.get(ObjectNumber.of(3));
  assert(entry3 !== undefined && entry3.type === 1);
  expect(entry3.offset).toBe(50);
});

test("エントリの上書き: 同一ObjectNumberのエントリが新しい方で上書き", () => {
  const callback = callbackFromMap(
    stubMap([
      [
        500,
        {
          xref: makeXRef([[5, usedEntry(999)]], 6),
          trailer: makeTrailer(6, 0),
        },
      ],
      [
        0,
        { xref: makeXRef([[5, usedEntry(100)]], 6), trailer: makeTrailer(6) },
      ],
    ]),
  );

  const result = mergeXRefChain(ByteOffset.of(500), callback);

  assert(result.ok);
  const entry = result.value.mergedXRef.entries.get(ObjectNumber.of(5));
  assert(entry !== undefined && entry.type === 1);
  expect(entry.offset).toBe(999);
});

test("重複しないエントリ: 各テーブル固有のエントリがすべてマージ結果に含まれる", () => {
  const callback = callbackFromMap(
    stubMap([
      [
        400,
        {
          xref: makeXRef([[2, usedEntry(200)]], 3),
          trailer: makeTrailer(3, 50),
        },
      ],
      [
        50,
        { xref: makeXRef([[1, usedEntry(100)]], 2), trailer: makeTrailer(2) },
      ],
    ]),
  );

  const result = mergeXRefChain(ByteOffset.of(400), callback);

  assert(result.ok);
  expect(result.value.mergedXRef.entries.size).toBe(2);
  expect(result.value.mergedXRef.entries.has(ObjectNumber.of(1))).toBe(true);
  expect(result.value.mergedXRef.entries.has(ObjectNumber.of(2))).toBe(true);
});

test("free entry による used entry の上書き: type=0 が type=1 を無効化", () => {
  const callback = callbackFromMap(
    stubMap([
      [
        400,
        {
          xref: makeXRef([[1, freeEntry(0, 1)]], 2),
          trailer: makeTrailer(2, 50),
        },
      ],
      [
        50,
        { xref: makeXRef([[1, usedEntry(100)]], 2), trailer: makeTrailer(2) },
      ],
    ]),
  );

  const result = mergeXRefChain(ByteOffset.of(400), callback);

  assert(result.ok);
  const entry = result.value.mergedXRef.entries.get(ObjectNumber.of(1));
  assert(entry !== undefined);
  expect(entry.type).toBe(0);
});

test("compressed entry (type=2) による used entry (type=1) の上書き", () => {
  const callback = callbackFromMap(
    stubMap([
      [
        400,
        {
          xref: makeXRef([[1, compressedEntry(10, 0)]], 2),
          trailer: makeTrailer(2, 50),
        },
      ],
      [
        50,
        { xref: makeXRef([[1, usedEntry(100)]], 2), trailer: makeTrailer(2) },
      ],
    ]),
  );

  const result = mergeXRefChain(ByteOffset.of(400), callback);

  assert(result.ok);
  const entry = result.value.mergedXRef.entries.get(ObjectNumber.of(1));
  assert(entry !== undefined);
  expect(entry.type).toBe(2);
});

test("/Prev = 0（ByteOffset(0)）を持つ trailer が正しく辿られる", () => {
  const callback = callbackFromMap(
    stubMap([
      [
        500,
        {
          xref: makeXRef([[2, usedEntry(200)]], 3),
          trailer: makeTrailer(3, 0),
        },
      ],
      [
        0,
        { xref: makeXRef([[1, usedEntry(100)]], 2), trailer: makeTrailer(2) },
      ],
    ]),
  );

  const result = mergeXRefChain(ByteOffset.of(500), callback);

  assert(result.ok);
  expect(result.value.mergedXRef.entries.size).toBe(2);
  expect(result.value.mergedXRef.entries.has(ObjectNumber.of(1))).toBe(true);
  expect(result.value.mergedXRef.entries.has(ObjectNumber.of(2))).toBe(true);
});

test("size は全テーブルの最大値を採用", () => {
  const callback = callbackFromMap(
    stubMap([
      [
        300,
        {
          xref: makeXRef([[3, usedEntry(30)]], 8),
          trailer: makeTrailer(8, 200),
        },
      ],
      [
        200,
        {
          xref: makeXRef([[2, usedEntry(20)]], 10),
          trailer: makeTrailer(10, 50),
        },
      ],
      [
        50,
        { xref: makeXRef([[1, usedEntry(10)]], 5), trailer: makeTrailer(5) },
      ],
    ]),
  );

  const result = mergeXRefChain(ByteOffset.of(300), callback);

  assert(result.ok);
  expect(result.value.mergedXRef.size).toBe(10);
});

test("latestTrailer は最新トレイラをベースにし、size のみ mergedXRef.size で上書き", () => {
  const newRoot = {
    objectNumber: ObjectNumber.of(99),
    generationNumber: GenerationNumber.of(0),
  };
  const callback = callbackFromMap(
    stubMap([
      [
        300,
        {
          xref: makeXRef([[2, usedEntry(20)]], 5),
          trailer: { root: newRoot, size: 5, prev: ByteOffset.of(50) },
        },
      ],
      [
        50,
        { xref: makeXRef([[1, usedEntry(10)]], 20), trailer: makeTrailer(20) },
      ],
    ]),
  );

  const result = mergeXRefChain(ByteOffset.of(300), callback);

  assert(result.ok);
  expect(result.value.latestTrailer.root).toEqual(newRoot);
  expect(result.value.latestTrailer.size).toBe(20);
  expect(result.value.mergedXRef.size).toBe(20);
});

test("空のxrefテーブル（entries が空の Map）のマージ", () => {
  const callback = callbackFromMap(
    stubMap([[500, { xref: makeXRef([], 0), trailer: makeTrailer(0) }]]),
  );

  const result = mergeXRefChain(ByteOffset.of(500), callback);

  assert(result.ok);
  expect(result.value.mergedXRef.entries.size).toBe(0);
  expect(result.value.mergedXRef.size).toBe(0);
});

test("latestTrailer.size が mergedXRef.size（全テーブルの最大値）に正規化されている", () => {
  const callback = callbackFromMap(
    stubMap([
      [
        500,
        {
          xref: makeXRef([[2, usedEntry(20)]], 3),
          trailer: makeTrailer(3, 100),
        },
      ],
      [
        100,
        { xref: makeXRef([[1, usedEntry(10)]], 50), trailer: makeTrailer(50) },
      ],
    ]),
  );

  const result = mergeXRefChain(ByteOffset.of(500), callback);

  assert(result.ok);
  expect(result.value.mergedXRef.size).toBe(50);
  expect(result.value.latestTrailer.size).toBe(50);
});
