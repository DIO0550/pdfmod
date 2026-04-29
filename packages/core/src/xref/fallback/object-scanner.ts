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

interface BackwardHeader {
  readonly objectNumberValue: number;
  readonly generationValue: number;
  readonly headerOffset: number;
}

/**
 * 指定位置から行頭方向に走査し、同じ行内の `%` (コメント開始) の位置を返す。
 * 行末コード (LF/CR) を超えて遡らない。
 *
 * @param data - PDFバイト配列
 * @param pos - 走査開始位置
 * @returns コメント開始位置 (`%` のオフセット)。同じ行に `%` が無ければ -1
 */
function findCommentStartOnLine(data: Uint8Array, pos: number): number {
  let commentStart = -1;
  for (let scan = pos; scan >= 0 && !isPdfLineBreak(data[scan]); scan--) {
    if (data[scan] === PERCENT) {
      commentStart = scan;
    }
  }
  return commentStart;
}

/**
 * 逆方向に whitespace と PDF コメント (`% ... 行末`) をスキップする。
 * 数字とキーワードの間にコメントが挟まるケースに対応する。
 *
 * @param data - PDFバイト配列
 * @param pos - スキップ開始位置
 * @returns スキップ後の位置（次の有効バイトのインデックス、見つからなければ -1）
 */
function skipWhitespaceAndCommentsBackward(
  data: Uint8Array,
  pos: number,
): number {
  let i = pos;
  while (i >= 0) {
    if (isPdfWhitespace(data[i])) {
      i--;
      continue;
    }
    const commentStart = findCommentStartOnLine(data, i);
    if (commentStart < 0) {
      break;
    }
    i = commentStart - 1;
  }
  return i;
}

/**
 * 指定範囲を 10 進整数として読む。
 * 範囲外（safe integer 超過）は `Number.POSITIVE_INFINITY` を返す。
 *
 * @param data - PDFバイト配列
 * @param start - 開始位置（含む）
 * @param end - 終了位置（含まない）
 * @returns 読み取った数値。safe integer を超える場合は `Number.POSITIVE_INFINITY`。
 */
function readDigits(data: Uint8Array, start: number, end: number): number {
  let value = 0;
  for (let i = start; i < end; i++) {
    value = value * DECIMAL_RADIX + (data[i] - DIGIT_0);
    if (!NumberEx.isSafeIntegerAtLeastZero(value)) {
      return Number.POSITIVE_INFINITY;
    }
  }
  return value;
}

/**
 * `obj` キーワード位置から逆方向に `\d+ \s+ \d+ \s+` を読み、
 * オブジェクトヘッダ先頭位置と数値を抽出する。
 *
 * @param data - PDFバイト配列
 * @param objKeywordPos - `obj` の先頭バイト位置
 * @returns 抽出に成功した場合は `some(BackwardHeader)`、構造が壊れている場合は `none`
 */
function readHeaderBackward(
  data: Uint8Array,
  objKeywordPos: number,
): Option<BackwardHeader> {
  let i = objKeywordPos - 1;

  if (i < 0 || !isPdfWhitespace(data[i])) {
    return none;
  }
  i = skipWhitespaceAndCommentsBackward(data, i);

  const genEnd = i;
  while (i >= 0 && isPdfDigit(data[i])) {
    i--;
  }
  const genStart = i + 1;
  if (genStart > genEnd) {
    return none;
  }
  const generationValue = readDigits(data, genStart, genEnd + 1);

  if (i < 0 || !isPdfWhitespace(data[i])) {
    return none;
  }
  i = skipWhitespaceAndCommentsBackward(data, i);

  const objEnd = i;
  while (i >= 0 && isPdfDigit(data[i])) {
    i--;
  }
  const objStart = i + 1;
  if (objStart > objEnd) {
    return none;
  }
  const objectNumberValue = readDigits(data, objStart, objEnd + 1);

  return some({
    objectNumberValue,
    generationValue,
    headerOffset: objStart,
  });
}

/**
 * data 全域を 1 パス走査して `\d+ \d+ obj` ヘッダ候補を列挙する。
 * O(N)。検出された候補は `ObjectNumber.create` / `GenerationNumber.create` で
 * 検証し、`Err` となった候補は `skipped` に記録する。
 *
 * @param data - PDF ファイル全体のバイト配列
 * @returns 検出された ObjectHit[] と skip 情報
 */
/**
 * 候補位置 1 件の評価結果。
 * - `hit`: 有効なヘッダ
 * - `skipped`: ObjectNumber / GenerationNumber 検証で弾かれた候補
 * - `none`: マッチしない / 構造が壊れている（記録不要）
 */
type CandidateResult =
  | { readonly kind: "hit"; readonly hit: ObjectHit }
  | { readonly kind: "skipped"; readonly entry: ObjectScanSkipped }
  | { readonly kind: "none" };

/**
 * 指定位置を `\d+ \d+ obj` ヘッダ候補として評価する。
 * 副作用なし。push 振り分けは呼び出し側に委ねる。
 *
 * @param data - PDFバイト配列
 * @param pos - 候補開始位置 (`obj` キーワード先頭の想定)
 * @returns CandidateResult
 */
function evaluateCandidate(data: Uint8Array, pos: number): CandidateResult {
  if (pos + OBJ_LEN > data.length) {
    return { kind: "none" };
  }
  if (!matchesBytesAt(data, pos, OBJ_BYTES)) {
    return { kind: "none" };
  }
  const afterPos = pos + OBJ_LEN;
  if (afterPos < data.length && !isPdfTokenBoundary(data[afterPos])) {
    return { kind: "none" };
  }
  const headerOpt = readHeaderBackward(data, pos);
  if (!headerOpt.some) {
    return { kind: "none" };
  }
  const header = headerOpt.value;
  if (
    header.headerOffset > 0 &&
    !isPdfTokenBoundary(data[header.headerOffset - 1])
  ) {
    return { kind: "none" };
  }

  const offset = ByteOffset.of(header.headerOffset);
  const objectNumberResult = ObjectNumber.create(header.objectNumberValue);
  if (!objectNumberResult.ok) {
    return {
      kind: "skipped",
      entry: { offset, reason: "object-number-invalid" },
    };
  }
  const generationResult = GenerationNumber.create(header.generationValue);
  if (!generationResult.ok) {
    return {
      kind: "skipped",
      entry: { offset, reason: "generation-invalid" },
    };
  }

  return {
    kind: "hit",
    hit: {
      objectNumber: objectNumberResult.value,
      generation: generationResult.value,
      offset,
    },
  };
}

/**
 * data 全域を 1 パス走査して `\d+ \d+ obj` ヘッダ候補を列挙する。
 * O(N)。コメント領域は走査ループ内の `inComment` フラグで除外し、
 * 各候補の評価は `evaluateCandidate` に委譲する。
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
    } else if (data[i] === PERCENT) {
      inComment = true;
    }
    if (inComment) {
      continue;
    }
    const result = evaluateCandidate(data, i);
    if (result.kind === "hit") {
      hits.push(result.hit);
    } else if (result.kind === "skipped") {
      skipped.push(result.entry);
    }
  }

  return { hits, skipped };
}
