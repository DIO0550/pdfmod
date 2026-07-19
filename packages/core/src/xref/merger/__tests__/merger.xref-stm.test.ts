import { assert, expect, test } from "vitest";
import type { PdfError } from "../../../pdf/errors/index";
import { ByteOffset } from "../../../pdf/types/byte-offset/index";
import { GenerationNumber } from "../../../pdf/types/generation-number/index";
import type {
  TrailerDict,
  XRefEntry,
  XRefTable,
} from "../../../pdf/types/index";
import { ObjectNumber } from "../../../pdf/types/object-number/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";
import { mergeXRefChain } from "../index";

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

function makeTrailer(
  size: number,
  options: { prev?: number; xrefStm?: number } = {},
): TrailerDict {
  return {
    root: dummyRoot,
    size,
    prev: options.prev !== undefined ? ByteOffset.of(options.prev) : undefined,
    xrefStm:
      options.xrefStm !== undefined
        ? ByteOffset.of(options.xrefStm)
        : undefined,
  };
}

type ParseCallback = (
  offset: ByteOffset,
) => Promise<Result<{ xref: XRefTable; trailer: TrailerDict }, PdfError>>;

function stubMap(
  entries: Array<[number, { xref: XRefTable; trailer: TrailerDict }]>,
): Map<ByteOffset, { xref: XRefTable; trailer: TrailerDict }> {
  return new Map(entries.map(([n, v]) => [ByteOffset.of(n), v]));
}

function callbackFromMap(
  table: Map<ByteOffset, { xref: XRefTable; trailer: TrailerDict }>,
): ParseCallback {
  return async (offset: ByteOffset) => {
    const entry = table.get(offset);
    return entry
      ? ok(entry)
      : err({
          code: "XREF_TABLE_INVALID" as const,
          message: "unexpected offset",
        });
  };
}

test("/XRefStmがある場合、ストリーム側のエントリがテキスト側より優先される", async () => {
  const textXref = makeXRef([[5, usedEntry(100)]], 6);
  const streamXref = makeXRef([[5, compressedEntry(10, 0)]], 6);
  const callback = callbackFromMap(
    stubMap([
      [500, { xref: textXref, trailer: makeTrailer(6, { xrefStm: 900 }) }],
      [900, { xref: streamXref, trailer: makeTrailer(6) }],
    ]),
  );

  const result = await mergeXRefChain(ByteOffset.of(500), callback);

  assert(result.ok);
  const entry = result.value.mergedXRef.entries.get(ObjectNumber.of(5));
  assert(entry !== undefined);
  expect(entry.type).toBe(2);
});

test("/XRefStm側にしかないエントリ（ObjStm内オブジェクト）もマージ結果に含まれる", async () => {
  const textXref = makeXRef([[1, usedEntry(50)]], 3);
  const streamXref = makeXRef([[2, compressedEntry(10, 0)]], 3);
  const callback = callbackFromMap(
    stubMap([
      [500, { xref: textXref, trailer: makeTrailer(3, { xrefStm: 900 }) }],
      [900, { xref: streamXref, trailer: makeTrailer(3) }],
    ]),
  );

  const result = await mergeXRefChain(ByteOffset.of(500), callback);

  assert(result.ok);
  expect(result.value.mergedXRef.entries.size).toBe(2);
  const entry2 = result.value.mergedXRef.entries.get(ObjectNumber.of(2));
  assert(entry2 !== undefined && entry2.type === 2);
  expect(entry2.streamObject).toBe(10);
});

test("/XRefStmがない場合はテキスト側のエントリのみが使われる", async () => {
  const textXref = makeXRef([[1, usedEntry(50)]], 2);
  const callback = callbackFromMap(
    stubMap([[500, { xref: textXref, trailer: makeTrailer(2) }]]),
  );

  const result = await mergeXRefChain(ByteOffset.of(500), callback);

  assert(result.ok);
  expect(result.value.mergedXRef.entries.size).toBe(1);
});

test("/XRefStmのオフセットが既に走査済みの場合、XREF_PREV_CHAIN_CYCLEが返る", async () => {
  const textXref = makeXRef([[1, usedEntry(50)]], 2);
  const olderXref = makeXRef([[2, usedEntry(80)]], 3);
  const callback = callbackFromMap(
    stubMap([
      // /XRefStm が /Prev チェーンの先で既に訪問済みのオフセットを指す
      [
        500,
        {
          xref: textXref,
          trailer: makeTrailer(2, { prev: 100, xrefStm: 100 }),
        },
      ],
      [100, { xref: olderXref, trailer: makeTrailer(3) }],
    ]),
  );

  const result = await mergeXRefChain(ByteOffset.of(500), callback);

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_PREV_CHAIN_CYCLE");
});

test("/XRefStm側のtrailerの/Prevは辿られず、テキスト側の/Prevのみでチェーンが継続する", async () => {
  const newTextXref = makeXRef([[3, usedEntry(300)]], 4);
  const newStreamXref = makeXRef([[4, compressedEntry(10, 0)]], 4);
  const oldTextXref = makeXRef([[1, usedEntry(10)]], 2);
  // ストリーム側 trailer に /Prev があっても無視され、辿られてはならない
  const trapXref = makeXRef([[99, usedEntry(9999)]], 100);

  const callback = callbackFromMap(
    stubMap([
      [
        500,
        {
          xref: newTextXref,
          trailer: makeTrailer(4, { prev: 100, xrefStm: 900 }),
        },
      ],
      [900, { xref: newStreamXref, trailer: makeTrailer(4, { prev: 999 }) }],
      [100, { xref: oldTextXref, trailer: makeTrailer(2) }],
      [999, { xref: trapXref, trailer: makeTrailer(100) }],
    ]),
  );

  const result = await mergeXRefChain(ByteOffset.of(500), callback);

  assert(result.ok);
  expect(result.value.mergedXRef.entries.has(ObjectNumber.of(99))).toBe(false);
  expect(result.value.mergedXRef.entries.has(ObjectNumber.of(1))).toBe(true);
});

test("latestTrailerは常にテキスト側のtrailerが採用される", async () => {
  const textXref = makeXRef([[1, usedEntry(50)]], 2);
  const streamXref = makeXRef([[1, usedEntry(999)]], 2);
  const callback = callbackFromMap(
    stubMap([
      [500, { xref: textXref, trailer: makeTrailer(2, { xrefStm: 900 }) }],
      [900, { xref: streamXref, trailer: makeTrailer(2) }],
    ]),
  );

  const result = await mergeXRefChain(ByteOffset.of(500), callback);

  assert(result.ok);
  expect(result.value.latestTrailer.root).toEqual(dummyRoot);
  expect(result.value.latestTrailer.xrefStm).toBe(900);
});
