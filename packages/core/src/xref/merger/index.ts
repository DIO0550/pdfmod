import type { PdfParseError } from "../../errors/index";
import type { Err, Result } from "../../result/index";
import { err, ok } from "../../result/index";
import type { ByteOffset } from "../../types/byte-offset/index";
import type { TrailerDict, XRefTable } from "../../types/index";
import type { ObjectNumber } from "../../types/object-number/index";
import type { XRefEntry } from "../../types/pdf-types/index";

const DEFAULT_MAX_PREV_CHAIN_DEPTH = 100;

/**
 * /Prevチェーン走査エラーを生成する。
 *
 * @param code - エラーコード
 * @param message - エラーメッセージ
 * @param offset - 問題が検出されたバイトオフセット
 * @returns PdfParseError を含む Err
 */
function failPrevChain(
  code: "XREF_PREV_CHAIN_CYCLE" | "XREF_PREV_CHAIN_TOO_DEEP",
  message: string,
  offset?: ByteOffset,
): Err<PdfParseError> {
  return err({ code, message, offset });
}

/**
 * maxDepth オプションを検証し、有効な値またはデフォルト値を返す。
 *
 * @param maxDepth - ユーザー指定の最大深さ（未定義または無効値の場合デフォルト適用）
 * @returns 有効な最大深さ
 */
function resolveMaxDepth(maxDepth: number | undefined): number {
  return maxDepth !== undefined &&
    Number.isSafeInteger(maxDepth) &&
    maxDepth >= 1
    ? maxDepth
    : DEFAULT_MAX_PREV_CHAIN_DEPTH;
}

/**
 * /Prevチェーンを辿り、全xrefテーブルをマージする。
 * 新しいエントリが古いものを上書きし、最新のトレイラ辞書を返す。
 *
 * @param startOffset - 最初のxrefセクションのバイトオフセット（startxrefの値）
 * @param parseCallback - オフセットからxref+trailerをパースするコールバック
 * @param options - オプション（maxDepth: /Prevチェーンの最大走査深さ、デフォルト100）
 * @returns マージ済みXRefTableと最新TrailerDict、またはPdfParseError
 */
export function mergeXRefChain(
  startOffset: ByteOffset,
  parseCallback: (
    offset: ByteOffset,
  ) => Result<{ xref: XRefTable; trailer: TrailerDict }, PdfParseError>,
  options?: { readonly maxDepth?: number },
): Result<
  { mergedXRef: XRefTable; latestTrailer: TrailerDict },
  PdfParseError
> {
  const maxDepth = resolveMaxDepth(options?.maxDepth);
  const visited = new Set<number>();
  const chain: Array<{ xref: XRefTable; trailer: TrailerDict }> = [];

  let currentOffset: ByteOffset = startOffset;
  let depth = 0;

  for (;;) {
    const offsetNum = currentOffset as unknown as number;

    if (visited.has(offsetNum)) {
      return failPrevChain(
        "XREF_PREV_CHAIN_CYCLE",
        `Circular /Prev reference detected at offset ${offsetNum}`,
        currentOffset,
      );
    }

    if (depth >= maxDepth) {
      return failPrevChain(
        "XREF_PREV_CHAIN_TOO_DEEP",
        `/Prev chain exceeds maximum depth of ${maxDepth}`,
        currentOffset,
      );
    }

    visited.add(offsetNum);

    const parseResult = parseCallback(currentOffset);
    if (!parseResult.ok) {
      return parseResult;
    }

    chain.push(parseResult.value);
    depth++;

    const { trailer } = parseResult.value;
    if (trailer.prev === undefined) {
      break;
    }

    currentOffset = trailer.prev;
  }

  chain.reverse();

  const mergedEntries = new Map<ObjectNumber, XRefEntry>();
  let maxSize = 0;

  for (const { xref } of chain) {
    for (const [objNum, entry] of xref.entries) {
      mergedEntries.set(objNum, entry);
    }
    maxSize = Math.max(maxSize, xref.size);
  }

  const latestTrailer = chain[chain.length - 1].trailer;

  return ok({
    mergedXRef: { entries: mergedEntries, size: maxSize },
    latestTrailer: { ...latestTrailer, size: maxSize },
  });
}
