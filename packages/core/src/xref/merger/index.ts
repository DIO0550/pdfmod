import type { PdfError } from "../../pdf/errors/index";
import type { ByteOffset } from "../../pdf/types/byte-offset/index";
import type { TrailerDict, XRefEntry, XRefTable } from "../../pdf/types/index";
import type { ObjectNumber } from "../../pdf/types/object-number/index";
import { none, type Option, some } from "../../utils/option/index";
import type { Err, Result } from "../../utils/result/index";
import { err, ok } from "../../utils/result/index";
import { MaxDepth } from "./max-depth/index";

/**
 * /Prevチェーン走査エラーを生成する。
 *
 * @param code - エラーコード
 * @param message - エラーメッセージ
 * @param offset - 問題が検出されたバイトオフセット
 * @returns PdfError を含む Err
 */
function failPrevChain(
  code: "XREF_PREV_CHAIN_CYCLE" | "XREF_PREV_CHAIN_TOO_DEEP",
  message: string,
  offset?: ByteOffset,
): Err<PdfError> {
  return err({ code, message, offset });
}

/**
 * オフセットが走査済みなら循環エラーを `Some` で返し、未走査なら `traversedOffsets`
 * に登録して `None` を返す。`/Prev` と `/XRefStm` の両方の循環検出で共有する。
 * 成功時に値を持たない検証系のため `Result<void, E>` ではなく `Option<E>` で表現する。
 *
 * @param offset - 判定対象のオフセット
 * @param traversedOffsets - 走査済みオフセット集合（副作用で追加）
 * @param sourceLabel - エラーメッセージに含める参照元の名称（`/Prev` または `/XRefStm`）
 * @returns 循環なら `Some<PdfError>`、未走査なら `None`
 */
function checkAndMarkVisited(
  offset: ByteOffset,
  traversedOffsets: Set<ByteOffset>,
  sourceLabel: "/Prev" | "/XRefStm",
): Option<PdfError> {
  if (traversedOffsets.has(offset)) {
    return some({
      code: "XREF_PREV_CHAIN_CYCLE",
      message: `Circular ${sourceLabel} reference detected at offset ${String(offset)}`,
      offset,
    });
  }
  traversedOffsets.add(offset);
  return none;
}

/**
 * 1つのxrefセクション（/Prevチェーンの1ホップ分）を表す内部構造。
 * `xrefLayers` は適用順（先が古い・後が新しい）で保持し、後のレイヤーが
 * 同一オブジェクト番号のエントリを上書きする。ハイブリッド参照ファイル
 * (XM-005) では `[テキスト側, ストリーム側]` の2層になり、ストリーム側の
 * エントリがテキスト側を上書きする。`trailer` は常にテキスト形式
 * （またはxrefストリーム自身）の trailer で、チェーン継続・最新trailer
 * の両方に使われる。
 */
interface ChainLink {
  readonly xrefLayers: readonly XRefTable[];
  readonly trailer: TrailerDict;
}

/**
 * 収集済みの xref チェーンをマージし、統合結果を返す。
 * chain は newest-first の順序で渡される。[...chain].reverse() で oldest から走査し、
 * newer が older を上書きする形でエントリを統合する。chain は破壊しない。
 *
 * @precondition chain は非空であること（呼び出し元で最低1回の parseCallback 成功を保証）
 * @param chain - newest-first で収集された xref セクションの列
 * @returns マージ済み XRefTable と、size を正規化した最新 TrailerDict
 */
function mergeCollectedChain(chain: ReadonlyArray<ChainLink>): {
  mergedXRef: XRefTable;
  latestTrailer: TrailerDict;
} {
  const mergedEntries = new Map<ObjectNumber, XRefEntry>();
  let maxSize = 0;

  for (const { xrefLayers } of [...chain].reverse()) {
    for (const xref of xrefLayers) {
      for (const [objNum, entry] of xref.entries) {
        mergedEntries.set(objNum, entry);
      }
      maxSize = Math.max(maxSize, xref.size);
    }
  }

  const latestTrailer = chain[0].trailer;

  return {
    mergedXRef: { entries: mergedEntries, size: maxSize },
    latestTrailer: { ...latestTrailer, size: maxSize },
  };
}

/** xref+trailer をオフセットからパースするコールバック。 */
type XRefParseCallback = (
  offset: ByteOffset,
) => Promise<Result<{ xref: XRefTable; trailer: TrailerDict }, PdfError>>;

/**
 * 現在のホップに `/XRefStm` があれば、`/Prev` を辿る前にそのオフセットを
 * 解決し、ストリーム側の XRefTable をテキスト側の後ろに積んだレイヤー列を返す
 * (ISO 32000-1 §7.5.8.4, XM-005)。`/XRefStm` オフセットも循環検出対象に加える。
 *
 * @param textXref - 現在のホップのテキスト（または単独ストリーム）側 XRefTable
 * @param trailer - 現在のホップの trailer（`/XRefStm` の有無を判定する）
 * @param parseCallback - オフセットからxref+trailerをパースするコールバック
 * @param traversedOffsets - 循環検出用の走査済みオフセット集合（副作用で追加）
 * @returns 成功時は `Ok<XRefTable[]>`（xrefStmなしなら `[textXref]` のみ）、失敗時は `Err<PdfError>`
 */
async function resolveXRefLayers(
  textXref: XRefTable,
  trailer: TrailerDict,
  parseCallback: XRefParseCallback,
  traversedOffsets: Set<ByteOffset>,
): Promise<Result<XRefTable[], PdfError>> {
  if (trailer.xrefStm === undefined) {
    return ok([textXref]);
  }

  const xrefStmOffset = trailer.xrefStm;
  const cycleCheck = checkAndMarkVisited(
    xrefStmOffset,
    traversedOffsets,
    "/XRefStm",
  );
  if (cycleCheck.some) {
    return err(cycleCheck.value);
  }

  const xrefStmResult = await parseCallback(xrefStmOffset);
  if (!xrefStmResult.ok) {
    return xrefStmResult;
  }

  return ok([textXref, xrefStmResult.value.xref]);
}

/**
 * /Prevチェーンを辿り、全xrefテーブルをマージする。
 * 新しいエントリが古いものを上書きし、最新のトレイラ辞書を返す。
 * trailer に `/XRefStm` があれば、`/Prev` を辿る前にそのオフセットの
 * 相互参照ストリームを読み、同一更新世代内ではストリーム側のエントリを
 * テキスト側より優先する（ISO 32000-1 §7.5.8.4, XM-005）。
 *
 * @param startOffset - 最初のxrefセクションのバイトオフセット（startxrefの値）
 * @param parseCallback - オフセットからxref+trailerを非同期にパースするコールバック
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
  const chain: ChainLink[] = [];

  let currentOffset: ByteOffset = startOffset;
  let depth = 0;

  while (true) {
    const cycleCheck = checkAndMarkVisited(
      currentOffset,
      traversedOffsets,
      "/Prev",
    );
    if (cycleCheck.some) {
      return err(cycleCheck.value);
    }

    if (depth >= (maxDepth as number)) {
      return failPrevChain(
        "XREF_PREV_CHAIN_TOO_DEEP",
        `/Prev chain exceeds maximum depth of ${String(maxDepth as number)}`,
        currentOffset,
      );
    }

    const parseResult = await parseCallback(currentOffset);
    if (!parseResult.ok) {
      return parseResult;
    }
    depth++;

    const { xref, trailer } = parseResult.value;
    const layersResult = await resolveXRefLayers(
      xref,
      trailer,
      parseCallback,
      traversedOffsets,
    );
    if (!layersResult.ok) {
      return layersResult;
    }

    chain.push({ xrefLayers: layersResult.value, trailer });

    if (trailer.prev === undefined) {
      break;
    }

    currentOffset = trailer.prev;
  }

  return ok(mergeCollectedChain(chain));
}
