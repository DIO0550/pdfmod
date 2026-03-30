import { assert, expect, test } from "vitest";
import type { PdfParseError } from "../../errors/index";
import type { Result } from "../../result/index";
import { ok } from "../../result/index";
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

test("maxDepth = 1 で単一xrefが成功する", () => {
  const callback: ParseCallback = (_offset: ByteOffset) =>
    ok({
      xref: makeXRef([[1, usedEntry(100)]], 2),
      trailer: makeTrailer(2),
    });

  const result = mergeXRefChain(ByteOffset.of(500), callback, { maxDepth: 1 });

  assert(result.ok);
  expect(result.value.mergedXRef.size).toBe(2);
});

test("maxDepth = 1 で2段チェーンが深さ制限エラーになる", () => {
  let calls = 0;
  const callback: ParseCallback = (_offset: ByteOffset) => {
    calls++;
    return ok({
      xref: makeXRef([[calls, usedEntry(calls * 100)]], calls + 1),
      trailer: makeTrailer(calls + 1, calls === 1 ? 50 : undefined),
    });
  };

  const result = mergeXRefChain(ByteOffset.of(400), callback, { maxDepth: 1 });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_PREV_CHAIN_TOO_DEEP");
});

test("maxDepth オプション指定: カスタム深さ制限が適用される", () => {
  let counter = 0;
  const callback: ParseCallback = (_offset: ByteOffset) => {
    counter++;
    return ok({
      xref: makeXRef([[counter, usedEntry(counter * 100)]], counter + 1),
      trailer: makeTrailer(counter + 1, counter * 1000),
    });
  };

  const result = mergeXRefChain(ByteOffset.of(0), callback, { maxDepth: 3 });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_PREV_CHAIN_TOO_DEEP");
});

test.each([
  0,
  -1,
  NaN,
  1.5,
  Infinity,
])("maxDepth に無効値 %s を渡した場合、デフォルト値（100）が適用される", (invalidValue) => {
  const callback: ParseCallback = (_offset: ByteOffset) =>
    ok({
      xref: makeXRef([[1, usedEntry(100)]], 2),
      trailer: makeTrailer(2),
    });

  const result = mergeXRefChain(ByteOffset.of(500), callback, {
    maxDepth: invalidValue,
  });

  assert(
    result.ok,
    `maxDepth=${invalidValue} should fallback to default and succeed`,
  );
});
