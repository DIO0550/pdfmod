import type { PdfError, PdfWarning } from "../../pdf/errors/index";
import type {
  ObjectNumber,
  TrailerDict,
  XRefTable,
  XRefUsedEntry,
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
 * ObjectHit 列から XRefTable を再構築する (FB-001 + FB-003)。
 * 先頭→末尾順に `Map.set` するため、同一オブジェクト番号は末尾候補が勝つ。
 * `size` は `max(objectNumber) + 1`。hits が空の場合は size=0 の空 table。
 *
 * @param hits - object-scanner が検出した ObjectHit 列
 * @returns 再構築した XRefTable
 */
function rebuildXRefTable(hits: readonly ObjectHit[]): XRefTable {
  const entries = new Map<ObjectNumber, XRefUsedEntry>();
  let maxObjectNumber = -1;
  for (const hit of hits) {
    entries.set(hit.objectNumber, {
      type: 1,
      offset: hit.offset,
      generationNumber: hit.generation,
    });
    if (hit.objectNumber > maxObjectNumber) {
      maxObjectNumber = hit.objectNumber;
    }
  }
  return { entries, size: maxObjectNumber + 1 };
}

/**
 * `ObjectScanSkipped` を理由カテゴリごとに集計し、`recovery` 用の文字列を組み立てる。
 * 例: `"Skipped 2 invalid candidates: 1 object-number-invalid, 1 generation-invalid"`
 * skipped が空の場合は `undefined` を返す。
 */
function summarizeSkippedRecovery(
  skipped: readonly ObjectScanSkipped[],
): string | undefined {
  if (skipped.length === 0) {
    return undefined;
  }
  const counts = new Map<ObjectScanSkipped["reason"], number>();
  for (const entry of skipped) {
    counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [reason, count] of counts) {
    parts.push(`${count} ${reason}`);
  }
  return `Skipped ${skipped.length} invalid candidates: ${parts.join(", ")}`;
}

/**
 * 再構築 1 回につき 1 件発行する `XREF_REBUILD` warning を組み立てる。
 * skip 候補の件数・理由カテゴリは `recovery` フィールドに集約する。
 *
 * @param report - object-scanner の走査結果（hits 件数 / skipped 集計）
 * @returns `XREF_REBUILD` コードを持つ単一の警告
 */
function buildRebuildWarning(report: ObjectScanReport): PdfWarning {
  const recovery = summarizeSkippedRecovery(report.skipped);
  const message = `Reconstructed xref by scanning ${report.hits.length} objects`;
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
  const xrefTable = rebuildXRefTable(report.hits);
  const warning = buildRebuildWarning(report);
  return ok({ xrefTable, trailer: undefined, warnings: [warning] });
}
