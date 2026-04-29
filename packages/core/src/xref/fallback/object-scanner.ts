import { NumberEx } from "../../ext/number/index";
import {
  isPdfDigit,
  isPdfLineBreak,
  isPdfTokenBoundary,
  isPdfWhitespace,
  matchesBytesAt,
} from "../../lexer/bytes/index";
import {
  ByteOffset,
  GenerationNumber,
  ObjectNumber,
} from "../../pdf/types/index";
import type { Option } from "../../utils/option/index";
import { none, some } from "../../utils/option/index";
import type { Result } from "../../utils/result/index";
import { err, ok } from "../../utils/result/index";

/**
 * `\d+ \d+ obj` ヘッダ検出結果。
 * `offset` はオブジェクトヘッダ先頭（最初の数字）のバイト位置。
 */
export interface ObjectHit {
  readonly objectNumber: ObjectNumber;
  readonly generation: GenerationNumber;
  readonly offset: ByteOffset;
}

/**
 * `ObjectNumber.create` / `GenerationNumber.create` の検証で弾かれた候補位置。
 * 呼び出し側で `XREF_REBUILD` warning の `recovery` に件数・理由カテゴリを集約する。
 */
export interface ObjectScanSkipped {
  readonly offset: ByteOffset;
  readonly reason: "object-number-invalid" | "generation-invalid";
}

export interface ObjectScanReport {
  readonly hits: readonly ObjectHit[];
  readonly skipped: readonly ObjectScanSkipped[];
}

const OBJ_BYTES = Array.from(new TextEncoder().encode("obj"));
const OBJ_LEN = OBJ_BYTES.length;

const DIGIT_0 = 0x30;

const PERCENT = 0x25;

const DECIMAL_RADIX = 10;

/**
 * 連続する数字列の範囲。
 */
interface DigitRange {
  readonly start: number;
  readonly endExclusive: number;
}

/**
 * 数値化前のオブジェクトヘッダ構造。
 */
interface ObjectHeaderRanges {
  readonly objectNumberRange: DigitRange;
  readonly generationRange: DigitRange;
  readonly headerOffset: number;
}

/**
 * 指定位置から行頭方向に走査し、同じ行内の `%` (コメント開始) の位置を返す。
 * 行末コード (LF/CR) を超えて遡らない。
 *
 * @param data - PDFバイト配列
 * @param pos - 走査開始位置
 * @returns コメント開始位置 (`%` のオフセット)。同じ行に `%` が無ければ `none`
 */
function findCommentStartOnLine(data: Uint8Array, pos: number): Option<number> {
  let commentStart = -1;
  for (let scan = pos; scan >= 0 && !isPdfLineBreak(data[scan]); scan--) {
    if (data[scan] === PERCENT) {
      commentStart = scan;
    }
  }
  if (commentStart < 0) {
    return none;
  }
  return some(commentStart);
}

/**
 * 指定位置から行頭方向に走査し、空白とコメントを飛ばした先の非空白バイト位置を返す。
 * ISO 32000 §7.2.4 によりコメントは単一の white-space 文字と等価に扱う。
 *
 * @param data - PDFバイト配列
 * @param fromIndex - 走査開始位置
 * @returns 非空白バイトの位置。先頭まで全て空白/コメントの場合は `none`
 */
function findPreviousNonWhitespaceByte(
  data: Uint8Array,
  fromIndex: number,
): Option<number> {
  let i = fromIndex;
  while (i >= 0) {
    if (isPdfWhitespace(data[i])) {
      i--;
      continue;
    }
    const commentStart = findCommentStartOnLine(data, i);
    if (!commentStart.some) {
      return some(i);
    }
    i = commentStart.value - 1;
  }
  return none;
}

/**
 * `lastIndex` で終わる連続数字列の範囲を返す。
 *
 * @param data - PDFバイト配列
 * @param lastIndex - 数字列の末尾位置（含む）
 * @returns 数字列の範囲。`lastIndex` の位置が数字でなければ `none`
 */
function findDigitsEndingAt(
  data: Uint8Array,
  lastIndex: number,
): Option<DigitRange> {
  if (lastIndex < 0 || !isPdfDigit(data[lastIndex])) {
    return none;
  }
  let start = lastIndex;
  while (start > 0 && isPdfDigit(data[start - 1])) {
    start--;
  }
  return some({ start, endExclusive: lastIndex + 1 });
}

/**
 * 指定範囲を 10 進整数として読む。
 *
 * @param data - PDFバイト配列
 * @param start - 開始位置（含む）
 * @param endExclusive - 終了位置（含まない）
 * @returns 読み取った数値。safe integer を超える場合は `none`。
 */
function readDigits(
  data: Uint8Array,
  start: number,
  endExclusive: number,
): Option<number> {
  let value = 0;
  for (let i = start; i < endExclusive; i++) {
    value = value * DECIMAL_RADIX + (data[i] - DIGIT_0);
    if (!NumberEx.isSafeIntegerAtLeastZero(value)) {
      return none;
    }
  }
  return some(value);
}

/**
 * `obj` キーワード位置から行頭方向に `\d+ \s+ \d+` を読み、
 * オブジェクトヘッダの構造（数字列の範囲とヘッダ先頭位置）を抽出する。
 *
 * @param data - PDFバイト配列
 * @param objKeywordPos - `obj` の先頭バイト位置
 * @returns 抽出に成功した場合は `some(ObjectHeaderRanges)`、構造が壊れている場合は `none`
 */
function readObjectHeader(
  data: Uint8Array,
  objKeywordPos: number,
): Option<ObjectHeaderRanges> {
  const beforeObj = objKeywordPos - 1;
  if (beforeObj < 0 || !isPdfWhitespace(data[beforeObj])) {
    return none;
  }
  const generationLast = findPreviousNonWhitespaceByte(data, beforeObj);
  if (!generationLast.some) {
    return none;
  }
  const generationRange = findDigitsEndingAt(data, generationLast.value);
  if (!generationRange.some) {
    return none;
  }

  const beforeGeneration = generationRange.value.start - 1;
  if (beforeGeneration < 0 || !isPdfWhitespace(data[beforeGeneration])) {
    return none;
  }
  const objectNumberLast = findPreviousNonWhitespaceByte(
    data,
    beforeGeneration,
  );
  if (!objectNumberLast.some) {
    return none;
  }
  const objectNumberRange = findDigitsEndingAt(data, objectNumberLast.value);
  if (!objectNumberRange.some) {
    return none;
  }

  return some({
    objectNumberRange: objectNumberRange.value,
    generationRange: generationRange.value,
    headerOffset: objectNumberRange.value.start,
  });
}

/**
 * 範囲を `ObjectNumber` として読み取り、検証する。
 *
 * @param data - PDFバイト配列
 * @param range - 数字列の範囲
 * @param offset - skip 記録用のヘッダ先頭位置
 * @returns 成功時は `ok(ObjectNumber)`、overflow/範囲外は `err(ObjectScanSkipped)`
 */
function readObjectNumber(
  data: Uint8Array,
  range: DigitRange,
  offset: ByteOffset,
): Result<ObjectNumber, ObjectScanSkipped> {
  const valueOpt = readDigits(data, range.start, range.endExclusive);
  if (!valueOpt.some) {
    return err({ offset, reason: "object-number-invalid" });
  }
  const created = ObjectNumber.create(valueOpt.value);
  if (!created.ok) {
    return err({ offset, reason: "object-number-invalid" });
  }
  return ok(created.value);
}

/**
 * 範囲を `GenerationNumber` として読み取り、検証する。
 *
 * @param data - PDFバイト配列
 * @param range - 数字列の範囲
 * @param offset - skip 記録用のヘッダ先頭位置
 * @returns 成功時は `ok(GenerationNumber)`、overflow/範囲外は `err(ObjectScanSkipped)`
 */
function readGenerationNumber(
  data: Uint8Array,
  range: DigitRange,
  offset: ByteOffset,
): Result<GenerationNumber, ObjectScanSkipped> {
  const valueOpt = readDigits(data, range.start, range.endExclusive);
  if (!valueOpt.some) {
    return err({ offset, reason: "generation-invalid" });
  }
  const created = GenerationNumber.create(valueOpt.value);
  if (!created.ok) {
    return err({ offset, reason: "generation-invalid" });
  }
  return ok(created.value);
}

/**
 * 指定位置から `\d+ \d+ obj` ヘッダの読み取りを試みる。
 * 副作用なし。Option/Result の二段構造で結果を返す:
 *
 * - `none` … 構造として header ではない（記録不要）
 * - `some(ok(hit))` … 有効なヘッダ
 * - `some(err(skipped))` … 構造は valid だが ObjectNumber/GenerationNumber 検証で弾かれた
 *
 * @param data - PDFバイト配列
 * @param pos - 候補開始位置 (`obj` キーワード先頭の想定)
 */
function tryReadObjectHeaderAt(
  data: Uint8Array,
  pos: number,
): Option<Result<ObjectHit, ObjectScanSkipped>> {
  if (pos + OBJ_LEN > data.length) {
    return none;
  }
  if (!matchesBytesAt(data, pos, OBJ_BYTES)) {
    return none;
  }
  const afterPos = pos + OBJ_LEN;
  if (afterPos < data.length && !isPdfTokenBoundary(data[afterPos])) {
    return none;
  }
  const headerOpt = readObjectHeader(data, pos);
  if (!headerOpt.some) {
    return none;
  }
  const header = headerOpt.value;
  if (
    header.headerOffset > 0 &&
    !isPdfTokenBoundary(data[header.headerOffset - 1])
  ) {
    return none;
  }

  const offset = ByteOffset.of(header.headerOffset);
  const objectNumberResult = readObjectNumber(
    data,
    header.objectNumberRange,
    offset,
  );
  if (!objectNumberResult.ok) {
    return some(err(objectNumberResult.error));
  }
  const generationResult = readGenerationNumber(
    data,
    header.generationRange,
    offset,
  );
  if (!generationResult.ok) {
    return some(err(generationResult.error));
  }

  return some(
    ok({
      objectNumber: objectNumberResult.value,
      generation: generationResult.value,
      offset,
    }),
  );
}

/**
 * data 全域を 1 パス走査して `\d+ \d+ obj` ヘッダ候補を列挙する。
 * O(N)。コメント領域は走査ループ内の `inComment` フラグで除外し、
 * 各候補の評価は `tryReadObjectHeaderAt` に委譲する。
 *
 * @param data - PDF ファイル全体のバイト配列
 * @returns 検出された ObjectHit[] と skip 情報
 */
export function scanObjectHeaders(data: Uint8Array): ObjectScanReport {
  const hits: ObjectHit[] = [];
  const skipped: ObjectScanSkipped[] = [];

  let inComment = false;
  for (let i = 0; i < data.length; i++) {
    if (isPdfLineBreak(data[i])) {
      inComment = false;
    }
    if (data[i] === PERCENT) {
      inComment = true;
    }
    if (inComment) {
      continue;
    }
    const read = tryReadObjectHeaderAt(data, i);
    if (!read.some) {
      continue;
    }
    const result = read.value;
    if (result.ok) {
      hits.push(result.value);
      continue;
    }
    skipped.push(result.error);
  }

  return { hits, skipped };
}
