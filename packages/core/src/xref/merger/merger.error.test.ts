import { assert, expect, test } from "vitest";
import type { PdfParseError } from "../../errors/index";
import type { Result } from "../../result/index";
import { err, ok } from "../../result/index";
import { ByteOffset } from "../../types/byte-offset/index";
import { GenerationNumber } from "../../types/generation-number/index";
import type { TrailerDict, XRefEntry, XRefTable } from "../../types/index";
import { ObjectNumber } from "../../types/object-number/index";
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

function callbackFromMap(
  table: Map<number, { xref: XRefTable; trailer: TrailerDict }>,
): ParseCallback {
  return (offset: ByteOffset) => {
    const entry = table.get(offset as unknown as number);
    return entry
      ? ok(entry)
      : err({
          code: "XREF_TABLE_INVALID" as const,
          message: "unexpected offset",
        });
  };
}

test("循環参照検出: 2つのxrefが互いのオフセットを /Prev で参照 -> XREF_PREV_CHAIN_CYCLE", () => {
  const callback = callbackFromMap(
    new Map([
      [
        100,
        {
          xref: makeXRef([[1, usedEntry(10)]], 2),
          trailer: makeTrailer(2, 200),
        },
      ],
      [
        200,
        {
          xref: makeXRef([[2, usedEntry(20)]], 3),
          trailer: makeTrailer(3, 100),
        },
      ],
    ]),
  );

  const result = mergeXRefChain(ByteOffset.of(100), callback);

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_PREV_CHAIN_CYCLE");
});

test("自己参照検出: /Prev が自分自身のオフセットを指す -> XREF_PREV_CHAIN_CYCLE", () => {
  const callback = callbackFromMap(
    new Map([
      [
        100,
        {
          xref: makeXRef([[1, usedEntry(10)]], 2),
          trailer: makeTrailer(2, 100),
        },
      ],
    ]),
  );

  const result = mergeXRefChain(ByteOffset.of(100), callback);

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_PREV_CHAIN_CYCLE");
});

test("深さ制限超過: maxDepth を超えるチェーン -> XREF_PREV_CHAIN_TOO_DEEP", () => {
  let counter = 0;
  const callback: ParseCallback = (_offset: ByteOffset) => {
    counter++;
    const xref = makeXRef([[counter, usedEntry(counter * 100)]], counter + 1);
    const trailer = makeTrailer(counter + 1, counter * 1000);
    return ok({ xref, trailer });
  };

  const result = mergeXRefChain(ByteOffset.of(0), callback, { maxDepth: 2 });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_PREV_CHAIN_TOO_DEEP");
});

test("コールバックエラー透過: parseCallback が Err を返した場合、そのエラーがそのまま返る", () => {
  const callback: ParseCallback = (_offset: ByteOffset) =>
    err({
      code: "XREF_TABLE_INVALID",
      message: "parse failed",
      offset: ByteOffset.of(42),
    });

  const result = mergeXRefChain(ByteOffset.of(500), callback);

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toBe("parse failed");
});
