import { NumberEx } from "../../ext/number/index";
import type { PdfParseError } from "../../pdf/errors/index";
import type { ByteOffset } from "../../pdf/types/byte-offset/index";
import type { TrailerDict, XRefEntry, XRefTable } from "../../pdf/types/index";
import type { ObjectNumber } from "../../pdf/types/object-number/index";
import type { Err, Result } from "../../utils/result/index";
import { err, ok } from "../../utils/result/index";

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
  return maxDepth !== undefined && NumberEx.isPositiveSafeInteger(maxDepth)
    ? maxDepth
    : DEFAULT_MAX_PREV_CHAIN_DEPTH;
}

/**
 * 収集済みの xref チェーンをマージし、統合結果を返す。
 * chain は newest-first の順序で渡される。[...chain].reverse() で oldest から走査し、
 * newer が older を上書きする形でエントリを統合する。chain は破壊しない。
 *
 * @precondition chain は非空であること（呼び出し元で最低1回の parseCallback 成功を保証）
 */
function mergeCollectedChain(
  chain: ReadonlyArray<{ xref: XRefTable; trailer: TrailerDict }>,
): { mergedXRef: XRefTable; latestTrailer: TrailerDict } {
  const mergedEntries = new Map<ObjectNumber, XRefEntry>();
  let maxSize = 0;

  for (const { xref } of [...chain].reverse()) {
    for (const [objNum, entry] of xref.entries) {
      mergedEntries.set(objNum, entry);
    }
    maxSize = Math.max(maxSize, xref.size);
  }

  const latestTrailer = chain[0].trailer;

  return {
    mergedXRef: { entries: mergedEntries, size: maxSize },
    latestTrailer: { ...latestTrailer, size: maxSize },
  };
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
  const traversedOffsets = new Set<ByteOffset>();
  const chain: Array<{ xref: XRefTable; trailer: TrailerDict }> = [];

  let currentOffset: ByteOffset = startOffset;
  let depth = 0;

  while (true) {
    if (traversedOffsets.has(currentOffset)) {
      return failPrevChain(
        "XREF_PREV_CHAIN_CYCLE",
        `Circular /Prev reference detected at offset ${String(currentOffset)}`,
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

    traversedOffsets.add(currentOffset);

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

  return ok(mergeCollectedChain(chain));
}
