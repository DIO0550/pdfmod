import { isPdfTokenBoundary, matchesBytesAt } from "../../lexer/bytes/index";
import type { PdfError, PdfWarning } from "../../pdf/errors/index";
import { ByteOffset } from "../../pdf/types/byte-offset/index";
import type {
  ObjectNumber,
  TrailerDict,
  XRefEntry,
  XRefTable,
} from "../../pdf/types/index";
import type { Option } from "../../utils/option/index";
import { none, some } from "../../utils/option/index";
import type { Result } from "../../utils/result/index";
import { ok } from "../../utils/result/index";
import { parseTrailer } from "../trailer/index";
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
 * - `trailer`: trailer 直接取得 / Catalog 推定 / 取得不可（None）の三状態を Option で表現。
 * - `warnings`: `XREF_REBUILD` を 1 件含む。skip 件数・理由カテゴリは同 warning の `recovery` に集約。
 */
export interface FallbackScanResult {
  readonly xrefTable: XRefTable;
  readonly trailer: Option<TrailerDict>;
  readonly warnings: readonly PdfWarning[];
}

const TRAILER_BYTES = Array.from(new TextEncoder().encode("trailer"));
const TRAILER_LEN = TRAILER_BYTES.length;
const ENDOBJ_BYTES = Array.from(new TextEncoder().encode("endobj"));
const STREAM_BYTES = Array.from(new TextEncoder().encode("stream"));
const ENDSTREAM_BYTES = Array.from(new TextEncoder().encode("endstream"));
const CATALOG_SPACED_BYTES = Array.from(
  new TextEncoder().encode("/Type /Catalog"),
);
const CATALOG_COMPACT_BYTES = Array.from(
  new TextEncoder().encode("/Type/Catalog"),
);
const PERCENT = 0x25;
const LF = 0x0a;
const CR = 0x0d;

/**
 * 1 obj の本体スコープ。`[hit.offset, bodyEnd)` が obj の中身として扱われる範囲。
 * `bodyEnd` は最初の `endobj` 位置（次 hit や file 末尾で頭打ち）。
 */
interface ObjectScope {
  readonly hit: ObjectHit;
  readonly bodyEnd: number;
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
 * `recovery` 用の文字列を組み立てる。skip が無ければ `none` を返す。
 *
 * @param skipped - object-scanner の skip 集計
 * @param sizeOverflowCount - `xrefTable.size` 超過のため skip した hit 数
 * @returns 集約された recovery 文字列の Option
 */
function formatRecoveryMessage(
  skipped: readonly ObjectScanSkipped[],
  sizeOverflowCount: number,
): Option<string> {
  if (skipped.length === 0 && sizeOverflowCount === 0) {
    return none;
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
  return some(`Skipped ${total} invalid candidates: ${parts.join(", ")}`);
}

/**
 * 再構築 1 回につき 1 件発行する `XREF_REBUILD` warning を組み立てる。
 * skip 候補の件数・理由カテゴリは `recovery` フィールドに集約する。
 *
 * @param report - object-scanner の走査結果（hits 件数 / skipped 集計）
 * @param sizeOverflowCount - `xrefTable.size` 超過のため skip した hit 数
 * @returns `XREF_REBUILD` コードを持つ単一の警告
 */
function formatRebuildWarning(
  report: ObjectScanReport,
  sizeOverflowCount: number,
): PdfWarning {
  const recovery = formatRecoveryMessage(report.skipped, sizeOverflowCount);
  const acceptedHits = report.hits.length - sizeOverflowCount;
  const message = `Reconstructed xref by scanning ${acceptedHits} objects`;
  if (!recovery.some) {
    return { code: "XREF_REBUILD", message };
  }
  return { code: "XREF_REBUILD", message, recovery: recovery.value };
}

/**
 * `pos` が PDF コメント（`%` から行末まで）の内部にあるか判定する。
 * 行頭方向に走査し、改行より先に `%` が見つかればコメント内とみなす。
 *
 * @param data - PDF バイト配列
 * @param pos - 判定対象位置
 * @returns コメント内であれば `true`
 */
function isInsideComment(data: Uint8Array, pos: number): boolean {
  for (let i = pos - 1; i >= 0; i--) {
    if (data[i] === LF || data[i] === CR) {
      return false;
    }
    if (data[i] === PERCENT) {
      return true;
    }
  }
  return false;
}

/**
 * `[offset, offset + length)` が前後でトークン境界に挟まれているか判定する。
 *
 * @param data - PDF バイト配列
 * @param offset - トークン開始位置
 * @param length - トークン長
 * @returns 前後が境界であれば `true`
 */
function hasTokenBoundary(
  data: Uint8Array,
  offset: number,
  length: number,
): boolean {
  if (offset > 0 && !isPdfTokenBoundary(data[offset - 1])) {
    return false;
  }
  const after = offset + length;
  if (after < data.length && !isPdfTokenBoundary(data[after])) {
    return false;
  }
  return true;
}

/**
 * `trailer` キーワード位置を末尾→先頭順に列挙する。
 * コメント内の出現と部分一致 (`mytrailer` 等) は除外する。
 *
 * @param data - PDF バイト配列
 * @returns 発見された trailer キーワードのバイトオフセット列（末尾優先順）
 */
function findTrailerOffsets(data: Uint8Array): number[] {
  if (data.length < TRAILER_LEN) {
    return [];
  }
  const offsets: number[] = [];
  for (let i = data.length - TRAILER_LEN; i >= 0; i--) {
    if (!matchesBytesAt(data, i, TRAILER_BYTES)) {
      continue;
    }
    if (!hasTokenBoundary(data, i, TRAILER_LEN)) {
      continue;
    }
    if (isInsideComment(data, i)) {
      continue;
    }
    offsets.push(i);
  }
  return offsets;
}

/**
 * 指定キーワードを token-boundary 付き / 非コメントで全列挙する (昇順)。
 *
 * @param data - PDF バイト配列
 * @param keyword - 検索キーワードのバイト列
 * @returns マッチした先頭オフセット列（昇順）
 */
function findKeywordPositions(data: Uint8Array, keyword: number[]): number[] {
  const positions: number[] = [];
  const klen = keyword.length;
  if (data.length < klen) {
    return positions;
  }
  const limit = data.length - klen;
  for (let i = 0; i <= limit; i++) {
    if (!matchesBytesAt(data, i, keyword)) {
      continue;
    }
    if (!hasTokenBoundary(data, i, klen)) {
      continue;
    }
    if (isInsideComment(data, i)) {
      continue;
    }
    positions.push(i);
  }
  return positions;
}

/**
 * 連続する `[start, end)` の範囲。`stream`〜`endstream` 区間を表すのに使う。
 */
interface ByteRange {
  readonly start: number;
  readonly end: number;
}

/**
 * `endstreamPositions`（昇順）の中で `streamOffset` より大きい最初の endstream
 * 位置のインデックスを返す。`fromIdx` から先頭方向には戻らない（findStreamRegions
 * が stream を昇順に処理する前提のため、ポインタ前進だけで線形時間に収まる）。
 *
 * @param endstreamPositions - findKeywordPositions(ENDSTREAM_BYTES) の結果（昇順）
 * @param fromIdx - 前回の stream までで進めた index（モノトーンに増えていく）
 * @param streamOffset - 今回の stream キーワード位置
 * @returns `endstreamPositions[idx] > streamOffset` を満たす最小の `idx`（無ければ `endstreamPositions.length`）
 */
function nextEndstreamIndexAfter(
  endstreamPositions: readonly number[],
  fromIdx: number,
  streamOffset: number,
): number {
  for (let idx = fromIdx; idx < endstreamPositions.length; idx++) {
    if (endstreamPositions[idx] > streamOffset) {
      return idx;
    }
  }
  return endstreamPositions.length;
}

/**
 * `stream` キーワードと直後の `endstream` をペアリングし、stream 領域として返す。
 * 偽 endobj/trailer 抑制に使う best-effort 検出のため、入れ子は考慮しない。
 *
 * @remarks 真の stream 終端は `/Length` の解決が必要だが、本フォールバックは
 *   stream dict 解析を行わないため、stream データ内に `endstream` バイト列が
 *   先に出現すると領域が早く閉じる可能性がある。これは fallback の design 上の
 *   既知制約で、それでも素のバイト走査だけより誤検出は減らせる。
 *
 * @param data - PDF バイト配列
 * @returns ペアリングされた stream 領域列
 */
function findStreamRegions(data: Uint8Array): ByteRange[] {
  const streamPositions = findKeywordPositions(data, STREAM_BYTES);
  const endstreamPositions = findKeywordPositions(data, ENDSTREAM_BYTES);
  const regions: ByteRange[] = [];
  let endIdx = 0;
  for (const sp of streamPositions) {
    endIdx = nextEndstreamIndexAfter(endstreamPositions, endIdx, sp);
    if (endIdx >= endstreamPositions.length) {
      regions.push({ start: sp, end: data.length });
      break;
    }
    regions.push({ start: sp, end: endstreamPositions[endIdx] });
    endIdx++;
  }
  return regions;
}

/**
 * `position` がいずれかの ByteRange に含まれるか判定する。
 *
 * @param ranges - 判定対象の範囲列
 * @param position - バイト位置
 * @returns 含まれていれば `true`
 */
function isInsideAnyRange(
  ranges: readonly ByteRange[],
  position: number,
): boolean {
  for (const r of ranges) {
    if (position >= r.start && position < r.end) {
      return true;
    }
  }
  return false;
}

/**
 * `endobj` キーワード位置を先頭→末尾順に列挙する。
 * コメント内・stream 領域内の偶発一致は除外する。
 *
 * @param data - PDF バイト配列
 * @param streamRegions - 除外する stream 領域列
 * @returns 発見された endobj キーワードのバイトオフセット列（昇順）
 */
function findEndobjPositions(
  data: Uint8Array,
  streamRegions: readonly ByteRange[],
): number[] {
  const all = findKeywordPositions(data, ENDOBJ_BYTES);
  if (streamRegions.length === 0) {
    return all;
  }
  const filtered: number[] = [];
  for (const pos of all) {
    if (isInsideAnyRange(streamRegions, pos)) {
      continue;
    }
    filtered.push(pos);
  }
  return filtered;
}

/**
 * `endobjPositions`（昇順）の中で `hitOffset` より大きい最初の endobj 位置の
 * インデックスを返す。`fromIdx` から先頭方向には戻らない（buildObjectScopes が
 * 単調に hit を進める前提のため、ポインタ前進だけで線形時間に収まる）。
 *
 * @param endobjPositions - findEndobjPositions の結果（昇順）
 * @param fromIdx - 前回の hit までで進めた index（モノトーンに増えていく）
 * @param hitOffset - 今回の hit のオフセット
 * @returns `endobjPositions[idx] > hitOffset` を満たす最小の `idx`（無ければ `endobjPositions.length`）
 */
function nextEndobjIndexAfter(
  endobjPositions: readonly number[],
  fromIdx: number,
  hitOffset: number,
): number {
  for (let idx = fromIdx; idx < endobjPositions.length; idx++) {
    if (endobjPositions[idx] > hitOffset) {
      return idx;
    }
  }
  return endobjPositions.length;
}

/**
 * 各 ObjectHit の本体スコープ `[hit.offset, bodyEnd)` を構築する。
 * `bodyEnd` は (a) `hit.offset` より後の最初の `endobj` 位置、(b) 次 hit の offset、
 * (c) ファイル末尾、のうち最も小さいもの。endobj 候補は best-effort のため、
 * 内部に偶発一致 endobj があるとスコープが小さくなる場合があるが、その場合も
 * 「obj 内」を過剰に判定するより縮める方を優先する。
 *
 * @param data - PDF バイト配列
 * @param hits - object-scanner が検出した ObjectHit 列
 * @param streamRegions - findStreamRegions の結果（stream 内 endobj 偽検出を抑制する）
 * @returns hit と同順に並ぶ ObjectScope[]
 */
function buildObjectScopes(
  data: Uint8Array,
  hits: readonly ObjectHit[],
  streamRegions: readonly ByteRange[],
): ObjectScope[] {
  if (hits.length === 0) {
    return [];
  }
  const sortedHits = [...hits].sort((a, b) => a.offset - b.offset);
  const endobjPositions = findEndobjPositions(data, streamRegions);
  const scopes: ObjectScope[] = [];
  let endobjIdx = 0;
  for (let i = 0; i < sortedHits.length; i++) {
    const hit = sortedHits[i];
    endobjIdx = nextEndobjIndexAfter(endobjPositions, endobjIdx, hit.offset);
    let nextOffset = data.length;
    if (i + 1 < sortedHits.length) {
      nextOffset = sortedHits[i + 1].offset;
    }
    let endobjEnd = data.length;
    if (endobjIdx < endobjPositions.length) {
      endobjEnd = endobjPositions[endobjIdx];
    }
    let bodyEnd = nextOffset;
    if (endobjEnd < nextOffset) {
      bodyEnd = endobjEnd;
    }
    scopes.push({ hit, bodyEnd });
  }
  return scopes;
}

/**
 * `position` がいずれかの ObjectScope 内に含まれるか判定する。
 *
 * @param scopes - buildObjectScopes の結果
 * @param position - 判定対象のバイト位置
 * @returns 含まれていれば `true`
 */
function isInsideAnyScope(
  scopes: readonly ObjectScope[],
  position: number,
): boolean {
  for (const scope of scopes) {
    if (position >= scope.hit.offset && position < scope.bodyEnd) {
      return true;
    }
  }
  return false;
}

/**
 * `position` を含む ObjectScope の hit を返す。
 *
 * @param scopes - buildObjectScopes の結果
 * @param position - 判定対象のバイト位置
 * @returns 含む scope の hit。無ければ `none`
 */
function findScopeContaining(
  scopes: readonly ObjectScope[],
  position: number,
): Option<ObjectHit> {
  for (const scope of scopes) {
    if (position >= scope.hit.offset && position < scope.bodyEnd) {
      return some(scope.hit);
    }
  }
  return none;
}

/**
 * trailer 候補列を末尾優先で `parseTrailer` に渡し、最初に成功したものを採用する (FB-002)。
 * obj 本体スコープ内の候補（コンテンツストリーム内の `trailer` 偶発一致を含む）は除外し、
 * `<<` 検証等で失敗した候補は次候補へフォールバックする。
 *
 * @param data - PDF バイト配列
 * @param scopes - obj 本体スコープ列（buildObjectScopes 由来）
 * @returns 採用した TrailerDict の Option。すべて失敗した場合は `none`
 */
function findValidTrailer(
  data: Uint8Array,
  scopes: readonly ObjectScope[],
): Option<TrailerDict> {
  const offsets = findTrailerOffsets(data);
  for (const off of offsets) {
    if (isInsideAnyScope(scopes, off)) {
      continue;
    }
    const result = parseTrailer(data, ByteOffset.of(off));
    if (result.ok) {
      return some(result.value);
    }
  }
  return none;
}

/**
 * `pattern` を含み、後続が token-boundary かつコメント内ではない位置を全列挙する。
 *
 * @param data - PDF バイト配列
 * @param pattern - 検索する byte 列
 * @returns 一致した先頭オフセット列（出現順）
 */
function findCatalogPositions(data: Uint8Array, pattern: number[]): number[] {
  const positions: number[] = [];
  const limit = data.length - pattern.length;
  for (let i = 0; i <= limit; i++) {
    if (!matchesBytesAt(data, i, pattern)) {
      continue;
    }
    const after = i + pattern.length;
    if (after < data.length && !isPdfTokenBoundary(data[after])) {
      continue;
    }
    if (isInsideComment(data, i)) {
      continue;
    }
    positions.push(i);
  }
  return positions;
}

/**
 * trailer 不在時に `/Type /Catalog` バイトリテラルから `IndirectRef` を推定し、
 * 最小 `TrailerDict { root, size }` を合成する (FB-004)。
 * `/Type /Catalog` と `/Type/Catalog` の双方を候補に含め、obj 本体スコープに収まり
 * かつ stream 領域に含まれない候補のうち最末尾を採用する（scope 外のゴミ領域や
 * stream データ内に偶発的に現れたバイト列は無視）。
 *
 * @param data - PDF ファイル全体
 * @param scopes - obj 本体スコープ列（buildObjectScopes 由来）
 * @param streamRegions - stream 領域列（findStreamRegions 由来）
 * @param size - `xrefTable.size`（合成 trailer の `size` フィールドに用いる）
 * @returns 合成した TrailerDict の Option。Catalog や紐付け先 obj が無ければ `none`
 */
function inferCatalogRoot(
  data: Uint8Array,
  scopes: readonly ObjectScope[],
  streamRegions: readonly ByteRange[],
  size: number,
): Option<TrailerDict> {
  const positions = [
    ...findCatalogPositions(data, CATALOG_SPACED_BYTES),
    ...findCatalogPositions(data, CATALOG_COMPACT_BYTES),
  ];
  let latestPosition = -1;
  let latestHit: Option<ObjectHit> = none;
  for (const p of positions) {
    if (isInsideAnyRange(streamRegions, p)) {
      continue;
    }
    const hit = findScopeContaining(scopes, p);
    if (!hit.some) {
      continue;
    }
    if (p > latestPosition) {
      latestPosition = p;
      latestHit = hit;
    }
  }
  if (!latestHit.some) {
    return none;
  }
  return some({
    root: {
      objectNumber: latestHit.value.objectNumber,
      generationNumber: latestHit.value.generation,
    },
    size,
  });
}

/**
 * xref 通常パース失敗時のフォールバックスキャナ (#19)。
 * FB-001/003 で XRefTable を再構築し、FB-002 で trailer を直接取得、
 * trailer 不在時は FB-004 で `/Type /Catalog` から最小 trailer を合成する。
 *
 * @param data - PDF ファイル全体のバイト配列
 * @returns 復元した XRef テーブル / trailer / `XREF_REBUILD` warning 1 件
 */
export function scanFallback(
  data: Uint8Array,
): Result<FallbackScanResult, PdfError> {
  const report = scanObjectHeaders(data);
  const { xrefTable, sizeOverflowCount } = rebuildXRefTable(report.hits);
  const warning = formatRebuildWarning(report, sizeOverflowCount);
  const streamRegions = findStreamRegions(data);
  const scopes = buildObjectScopes(data, report.hits, streamRegions);
  const directTrailer = findValidTrailer(data, scopes);
  if (directTrailer.some) {
    return ok({
      xrefTable,
      trailer: directTrailer,
      warnings: [warning],
    });
  }
  const synthTrailer = inferCatalogRoot(
    data,
    scopes,
    streamRegions,
    xrefTable.size,
  );
  return ok({ xrefTable, trailer: synthTrailer, warnings: [warning] });
}
