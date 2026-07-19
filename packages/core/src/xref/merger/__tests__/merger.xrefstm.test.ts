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
) => Promise<
  Result<{ xref: XRefTable; trailer: TrailerDict | undefined }, PdfError>
>;

function stubMap(
  entries: Array<
    [number, { xref: XRefTable; trailer: TrailerDict | undefined }]
  >,
): Map<ByteOffset, { xref: XRefTable; trailer: TrailerDict | undefined }> {
  return new Map(entries.map(([n, v]) => [ByteOffset.of(n), v]));
}

function callbackFromMap(
  table: Map<ByteOffset, { xref: XRefTable; trailer: TrailerDict | undefined }>,
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

test("同一世代内で/XRefStmのエントリがテキストセクションのエントリより優先される", async () => {
  const textXRef = makeXRef([[1, usedEntry(100)]], 2);
  const streamXRef = makeXRef([[1, compressedEntry(10, 0)]], 2);
  const callback = callbackFromMap(
    stubMap([
      [500, { xref: textXRef, trailer: makeTrailer(2, { xrefStm: 700 }) }],
      [700, { xref: streamXRef, trailer: makeTrailer(2) }],
    ]),
  );

  const result = await mergeXRefChain(ByteOffset.of(500), callback);

  assert(result.ok);
  const entry = result.value.mergedXRef.entries.get(ObjectNumber.of(1));
  assert(entry !== undefined);
  expect(entry.type).toBe(2);
});

test("/XRefStm側にのみ存在するObjStm内オブジェクト（type=2）がマージ結果に含まれる", async () => {
  const textXRef = makeXRef([[1, usedEntry(100)]], 3);
  const streamXRef = makeXRef([[2, compressedEntry(10, 0)]], 3);
  const callback = callbackFromMap(
    stubMap([
      [500, { xref: textXRef, trailer: makeTrailer(3, { xrefStm: 700 }) }],
      [700, { xref: streamXRef, trailer: makeTrailer(3) }],
    ]),
  );

  const result = await mergeXRefChain(ByteOffset.of(500), callback);

  assert(result.ok);
  expect(result.value.mergedXRef.entries.get(ObjectNumber.of(1))).toEqual(
    usedEntry(100),
  );
  const entry2 = result.value.mergedXRef.entries.get(ObjectNumber.of(2));
  assert(entry2 !== undefined);
  expect(entry2.type).toBe(2);
});

test("チェーンの継続はテキストtrailer側の/Prevを使い、/XRefStm側の/Prevは無視される", async () => {
  const newTextXRef = makeXRef([[1, usedEntry(999)]], 2);
  const newStreamXRef = makeXRef([[2, compressedEntry(10, 0)]], 2);
  const oldXRef = makeXRef([[1, usedEntry(100)]], 2);
  const callback = callbackFromMap(
    stubMap([
      [
        500,
        {
          xref: newTextXRef,
          trailer: makeTrailer(2, { xrefStm: 700, prev: 100 }),
        },
      ],
      // xrefStm側のtrailerにbogusなprevを仕込んでも辿られないことを確認する
      [700, { xref: newStreamXRef, trailer: makeTrailer(2, { prev: 99999 }) }],
      [100, { xref: oldXRef, trailer: makeTrailer(2) }],
    ]),
  );

  const result = await mergeXRefChain(ByteOffset.of(500), callback);

  assert(result.ok);
  expect(result.value.mergedXRef.entries.size).toBe(2);
  const entry1 = result.value.mergedXRef.entries.get(ObjectNumber.of(1));
  assert(entry1 !== undefined && entry1.type === 1);
  expect(entry1.offset).toBe(999);
});

test("/XRefStmが既訪問オフセットを指す場合XREF_PREV_CHAIN_CYCLEを返す", async () => {
  const textXRef = makeXRef([[1, usedEntry(100)]], 2);
  const callback = callbackFromMap(
    stubMap([
      [500, { xref: textXRef, trailer: makeTrailer(2, { xrefStm: 500 }) }],
    ]),
  );

  const result = await mergeXRefChain(ByteOffset.of(500), callback);

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_PREV_CHAIN_CYCLE");
});

test("/XRefStmが存在しないセクションはこれまで通りテキストエントリのみでマージされる", async () => {
  const textXRef = makeXRef([[1, usedEntry(100)]], 2);
  const callback = callbackFromMap(
    stubMap([[500, { xref: textXRef, trailer: makeTrailer(2) }]]),
  );

  const result = await mergeXRefChain(ByteOffset.of(500), callback);

  assert(result.ok);
  expect(result.value.mergedXRef.entries.get(ObjectNumber.of(1))).toEqual(
    usedEntry(100),
  );
});

test("/XRefStm側のtrailerがundefined（/Root欠如）でもxrefエントリはマージされる", async () => {
  const textXRef = makeXRef([[1, usedEntry(100)]], 2);
  const streamXRef = makeXRef([[2, compressedEntry(10, 0)]], 3);
  const callback = callbackFromMap(
    stubMap([
      [500, { xref: textXRef, trailer: makeTrailer(3, { xrefStm: 700 }) }],
      [700, { xref: streamXRef, trailer: undefined }],
    ]),
  );

  const result = await mergeXRefChain(ByteOffset.of(500), callback);

  assert(result.ok);
  const entry2 = result.value.mergedXRef.entries.get(ObjectNumber.of(2));
  assert(entry2 !== undefined);
  expect(entry2.type).toBe(2);
});

test("主セクション自体のtrailerがundefined（/Root欠如）の場合はROOT_NOT_FOUNDを返す", async () => {
  const textXRef = makeXRef([[1, usedEntry(100)]], 2);
  const callback = callbackFromMap(
    stubMap([[500, { xref: textXRef, trailer: undefined }]]),
  );

  const result = await mergeXRefChain(ByteOffset.of(500), callback);

  assert(!result.ok);
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
});
