import { assert, expect, test } from "vitest";
import type { PdfParseError } from "../../../pdf/errors/index";
import { ByteOffset } from "../../../pdf/types/byte-offset/index";
import { GenerationNumber } from "../../../pdf/types/generation-number/index";
import type {
  TrailerDict,
  XRefEntry,
  XRefTable,
} from "../../../pdf/types/index";
import { ObjectNumber } from "../../../pdf/types/object-number/index";
import type { Result } from "../../../utils/result/index";
import { ok } from "../../../utils/result/index";
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

test("maxDepth 未指定（options 省略）はデフォルト 100 で単一 xref を成功させる", () => {
  // 未指定経路: options 省略時に MaxDepth.DEFAULT (100) が採用され成功
  const callback: ParseCallback = (_offset: ByteOffset) =>
    ok({
      xref: makeXRef([[1, usedEntry(100)]], 2),
      trailer: makeTrailer(2),
    });

  const result = mergeXRefChain(ByteOffset.of(500), callback);

  assert(result.ok);
  expect(result.value.mergedXRef.size).toBe(2);
});

test("maxDepth: undefined 明示指定でもデフォルト 100 が適用される", () => {
  // 明示 undefined でも MaxDepth.DEFAULT が採用される
  const callback: ParseCallback = (_offset: ByteOffset) =>
    ok({
      xref: makeXRef([[1, usedEntry(100)]], 2),
      trailer: makeTrailer(2),
    });

  const result = mergeXRefChain(ByteOffset.of(500), callback, {
    maxDepth: undefined,
  });

  assert(result.ok);
});

test("maxDepth = Number.MAX_SAFE_INTEGER で単一 xref を成功させる", () => {
  // safe integer 上限も有効値として受理される
  const callback: ParseCallback = (_offset: ByteOffset) =>
    ok({
      xref: makeXRef([[1, usedEntry(100)]], 2),
      trailer: makeTrailer(2),
    });

  const result = mergeXRefChain(ByteOffset.of(500), callback, {
    maxDepth: Number.MAX_SAFE_INTEGER,
  });

  assert(result.ok);
});

test.each([
  0,
  -1,
  1.5,
  Infinity,
  -Infinity,
  Number.MAX_SAFE_INTEGER + 1,
])("maxDepth に無効値 %s を渡した場合、XREF_MAX_DEPTH_INVALID を返す", (invalidValue) => {
  // 異常系: 詳細な境界値は max-depth.validation.test.ts に集約。
  // ここでは「mergeXRefChain が MaxDepth.create の Err を素通しする」ことを確認する
  const callback: ParseCallback = (_offset: ByteOffset) =>
    ok({
      xref: makeXRef([[1, usedEntry(100)]], 2),
      trailer: makeTrailer(2),
    });

  const result = mergeXRefChain(ByteOffset.of(500), callback, {
    maxDepth: invalidValue,
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_MAX_DEPTH_INVALID");
});

test("maxDepth = NaN で XREF_MAX_DEPTH_INVALID を返す", () => {
  // NaN は test.each の label 表示が壊れるため単独 test に分離
  const callback: ParseCallback = (_offset: ByteOffset) =>
    ok({
      xref: makeXRef([[1, usedEntry(100)]], 2),
      trailer: makeTrailer(2),
    });

  const result = mergeXRefChain(ByteOffset.of(500), callback, {
    maxDepth: NaN,
  });

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_MAX_DEPTH_INVALID");
});

test("XREF_MAX_DEPTH_INVALID の message に invalid 値が含まれる", () => {
  // 検証補助: エラーメッセージから何が invalid だったかが分かる
  const callback: ParseCallback = (_offset: ByteOffset) =>
    ok({
      xref: makeXRef([[1, usedEntry(100)]], 2),
      trailer: makeTrailer(2),
    });

  const result = mergeXRefChain(ByteOffset.of(500), callback, { maxDepth: -1 });

  assert(!result.ok);
  expect(result.error.message).toContain("-1");
});
