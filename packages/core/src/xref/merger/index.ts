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
 * 収集済みの xref エントリレイヤーをマージし、統合結果を返す。
 * entryLayers は優先度が高い順（newest-first。同一世代内は /XRefStm 側がテキスト側より高優先）
 * で渡される。[...entryLayers].reverse() で優先度が低い方から走査し、
 * 優先度が高いレイヤーが低いレイヤーを上書きする形でエントリを統合する。entryLayers は破壊しない。
 *
 * @precondition entryLayers は非空であること（呼び出し元で最低1回の parseCallback 成功を保証）
 */
function mergeCollectedChain(
  entryLayers: ReadonlyArray<XRefTable>,
  latestTrailer: TrailerDict,
): { mergedXRef: XRefTable; latestTrailer: TrailerDict } {
  const mergedEntries = new Map<ObjectNumber, XRefEntry>();
  let maxSize = 0;

  for (const xref of [...entryLayers].reverse()) {
    for (const [objNum, entry] of xref.entries) {
      mergedEntries.set(objNum, entry);
    }
    maxSize = Math.max(maxSize, xref.size);
  }

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
 * ハイブリッド参照ファイル（ISO 32000-1 §7.5.8.4）対応: 各セクションの trailer に
 * `/XRefStm` があれば、`/Prev` を辿る前にそのオフセットの補助クロスリファレンス
 * ストリームを読み、同一世代内ではストリーム側のエントリをテキストセクションより
 * 優先してマージする（ObjStm 内オブジェクトの type=2 エントリはストリーム側にのみ
 * 存在しうるため）。チェーンの継続には常にテキスト trailer 側の `/Prev` を使う。
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
  const entryLayers: XRefTable[] = [];

  /**
   * 1つの xref セクション（テキストまたはストリーム）を読み、`/XRefStm` があれば
   * それも読んで `entryLayers` に優先度順（ストリーム側が高優先）で push する。
   * 戻り値の trailer はチェーン継続判定（`/Prev`）用。
   *
   * @param offset - 読み取り対象のバイトオフセット
   * @returns セクション自身の TrailerDict、またはエラー
   */
  const visitSection = async (
    offset: ByteOffset,
  ): Promise<Result<TrailerDict, PdfError>> => {
    const parseResult = await parseCallback(offset);
    if (!parseResult.ok) {
      return parseResult;
    }
    const { xref, trailer } = parseResult.value;

    if (trailer.xrefStm !== undefined) {
      const xrefStmOffset = trailer.xrefStm;
      if (traversedOffsets.has(xrefStmOffset)) {
        return failPrevChain(
          "XREF_PREV_CHAIN_CYCLE",
          `Circular /XRefStm reference detected at offset ${String(xrefStmOffset)}`,
          xrefStmOffset,
        );
      }
      traversedOffsets.add(xrefStmOffset);

      const xrefStmResult = await parseCallback(xrefStmOffset);
      if (!xrefStmResult.ok) {
        return xrefStmResult;
      }
      entryLayers.push(xrefStmResult.value.xref);
    }

    entryLayers.push(xref);
    return ok(trailer);
  };

  traversedOffsets.add(startOffset);
  const firstResult = await visitSection(startOffset);
  if (!firstResult.ok) {
    return firstResult;
  }
  const latestTrailer = firstResult.value;

  let currentOffset = latestTrailer.prev;
  let depth = 1;

  while (currentOffset !== undefined) {
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

    const result = await visitSection(currentOffset);
    if (!result.ok) {
      return result;
    }
    depth++;
    currentOffset = result.value.prev;
  }

  return ok(mergeCollectedChain(entryLayers, latestTrailer));
}
