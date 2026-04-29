import type { PdfError, PdfWarning } from "../../pdf/errors/index";
import type {
  ObjectNumber,
  TrailerDict,
  XRefEntry,
  XRefTable,
} from "../../pdf/types/index";
import type { Result } from "../../utils/result/index";
import { ok } from "../../utils/result/index";
import {
  type ObjectHit,
  type ObjectScanReport,
  type ObjectScanSkipped,
  scanObjectHeaders,
} from "./object-scanner";

/**
 * フォールバック XRef スキャン結果。
 *
 * - `xrefTable`: 復元した XRef テーブル（空でも返す）
 * - `trailer`: trailer 直接取得 / Catalog 推定 / 取得不可（undefined）の三状態。本 PR 範囲では常に `undefined`。
 * - `warnings`: `XREF_REBUILD` を 1 件含む。skip 件数・理由カテゴリは同 warning の `recovery` に集約。
 */
export interface FallbackScanResult {
  readonly xrefTable: XRefTable;
  readonly trailer: TrailerDict | undefined;
  readonly warnings: readonly PdfWarning[];
}

/**
 * `XRefTable.size` は `max(objectNumber) + 1` で算出するため、
 * `objectNumber === MAX_SAFE_INTEGER` の hit は size を不正値に押し上げる。
 * `parseXRefTable` 側の挙動（safe integer 超過は明示的に拒否）と整合させる。
 */
const MAX_OBJECT_NUMBER_FOR_SIZE = Number.MAX_SAFE_INTEGER - 1;

/**
 * size 超過 hit の集計結果。
 */
interface RebuildResult {
  readonly xrefTable: XRefTable;
  readonly sizeOverflowCount: number;
}

/**
 * ObjectHit 列から XRefTable を再構築する (FB-001 + FB-003)。
 * 先頭→末尾順に `Map.set` するため、同一オブジェクト番号は末尾候補が勝つ。
 * `size = max(objectNumber) + 1`。`objectNumber > MAX_SAFE_INTEGER - 1` の hit は
 * skip して safe integer を保証する（件数は呼び出し側で warning に集約する）。
 *
 * @param hits - object-scanner が検出した ObjectHit 列
 * @returns 再構築した XRefTable と size 超過で skip した件数
 */
function rebuildXRefTable(hits: readonly ObjectHit[]): RebuildResult {
  const entries = new Map<ObjectNumber, XRefEntry>();
  let maxObjectNumber = -1;
  let sizeOverflowCount = 0;
  for (const hit of hits) {
    if (hit.objectNumber > MAX_OBJECT_NUMBER_FOR_SIZE) {
      sizeOverflowCount++;
      continue;
    }
    entries.set(hit.objectNumber, {
      type: 1,
      offset: hit.offset,
      generationNumber: hit.generation,
    });
    if (hit.objectNumber > maxObjectNumber) {
      maxObjectNumber = hit.objectNumber;
    }
  }
  return {
    xrefTable: { entries, size: maxObjectNumber + 1 },
    sizeOverflowCount,
  };
}

type FallbackSkipReason = ObjectScanSkipped["reason"] | "size-overflow";

/**
 * skip 候補（object-scanner 由来 + size 超過）の件数・理由カテゴリから
 * `recovery` 用の文字列を組み立てる。skip が無ければ `undefined` を返す。
 */
function buildSkippedRecovery(
  skipped: readonly ObjectScanSkipped[],
  sizeOverflowCount: number,
): string | undefined {
  if (skipped.length === 0 && sizeOverflowCount === 0) {
    return undefined;
  }
  const counts = new Map<FallbackSkipReason, number>();
  for (const entry of skipped) {
    counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
  }
  if (sizeOverflowCount > 0) {
    counts.set("size-overflow", sizeOverflowCount);
  }
  const parts: string[] = [];
  for (const [reason, count] of counts) {
    parts.push(`${count} ${reason}`);
  }
  const total = skipped.length + sizeOverflowCount;
  return `Skipped ${total} invalid candidates: ${parts.join(", ")}`;
}

/**
 * 再構築 1 回につき 1 件発行する `XREF_REBUILD` warning を組み立てる。
 * skip 候補の件数・理由カテゴリは `recovery` フィールドに集約する。
 *
 * @param report - object-scanner の走査結果（hits 件数 / skipped 集計）
 * @param sizeOverflowCount - `xrefTable.size` 超過のため skip した hit 数
 * @returns `XREF_REBUILD` コードを持つ単一の警告
 */
function buildRebuildWarning(
  report: ObjectScanReport,
  sizeOverflowCount: number,
): PdfWarning {
  const recovery = buildSkippedRecovery(report.skipped, sizeOverflowCount);
  const acceptedHits = report.hits.length - sizeOverflowCount;
  const message = `Reconstructed xref by scanning ${acceptedHits} objects`;
  if (recovery === undefined) {
    return { code: "XREF_REBUILD", message };
  }
  return { code: "XREF_REBUILD", message, recovery };
}

/**
 * xref 通常パース失敗時のフォールバックスキャナ (#19)。
 * 本 PR 範囲では FB-001 + FB-003 のみ実装し、trailer は常に `undefined` を返す。
 *
 * @param data - PDF ファイル全体のバイト配列
 * @returns 復元した XRef テーブルと warnings（trailer は後続 PR で実装）
 */
export function scanFallback(
  data: Uint8Array,
): Result<FallbackScanResult, PdfError> {
  const report = scanObjectHeaders(data);
  const { xrefTable, sizeOverflowCount } = rebuildXRefTable(report.hits);
  const warning = buildRebuildWarning(report, sizeOverflowCount);
  return ok({ xrefTable, trailer: undefined, warnings: [warning] });
}
