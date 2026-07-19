import type { PdfError, PdfParseError } from "../../pdf/errors/index";
import type { ByteOffset } from "../../pdf/types/byte-offset/index";
import type { TrailerDict, XRefEntry, XRefTable } from "../../pdf/types/index";
import type { ObjectNumber } from "../../pdf/types/object-number/index";
import type { Err, Result } from "../../utils/result/index";
import { err, ok } from "../../utils/result/index";
import { MaxDepth } from "./max-depth/index";

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
 * xref+trailer をオフセットからパースするコールバック。
 * 間接オブジェクトのパース（xref ストリーム経路）を含みうるため非同期。
 */
type XRefParseCallback = (
  offset: ByteOffset,
) => Promise<Result<{ xref: XRefTable; trailer: TrailerDict }, PdfError>>;

/**
 * /Prevチェーンを辿り、全xrefテーブルをマージする。
 * 新しいエントリが古いものを上書きし、最新のトレイラ辞書を返す。
 *
 * @param startOffset - 最初のxrefセクションのバイトオフセット（startxrefの値）
 * @param parseCallback - オフセットからxref+trailerをパースする非同期コールバック
 * @param options - オプション（maxDepth: /Prevチェーンの最大走査深さ。
 *   `undefined` は既定値 100 を採用、正の safe integer 以外は
 *   `XREF_MAX_DEPTH_INVALID` を含む Err）
 * @returns マージ済みXRefTableと最新TrailerDict、
 *   maxDepth 不正時は `XREF_MAX_DEPTH_INVALID`、
 *   その他の失敗時は該当する `PdfError`
 */
export async function mergeXRefChain(
  startOffset: ByteOffset,
  parseCallback: XRefParseCallback,
  options?: { readonly maxDepth?: number },
): Promise<
  Result<{ mergedXRef: XRefTable; latestTrailer: TrailerDict }, PdfError>
> {
  const maxDepthResult = MaxDepth.create(options?.maxDepth);
  if (!maxDepthResult.ok) {
    return maxDepthResult;
  }
  const maxDepth = maxDepthResult.value;
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

    if (depth >= (maxDepth as number)) {
      return failPrevChain(
        "XREF_PREV_CHAIN_TOO_DEEP",
        `/Prev chain exceeds maximum depth of ${String(maxDepth as number)}`,
        currentOffset,
      );
    }

    traversedOffsets.add(currentOffset);

    const parseResult = await parseCallback(currentOffset);
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
