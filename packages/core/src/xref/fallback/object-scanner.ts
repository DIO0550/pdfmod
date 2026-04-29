import {
  isPdfTokenBoundary,
  isPdfWhitespace,
  matchesBytesAt,
} from "../../lexer/bytes/index";
import {
  type ByteOffset,
  ByteOffset as ByteOffsetCompanion,
  type GenerationNumber,
  GenerationNumber as GenerationNumberCompanion,
  type ObjectNumber,
  ObjectNumber as ObjectNumberCompanion,
} from "../../pdf/types/index";

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
  readonly reason: "object-number-invalid" | "generation-out-of-range";
}

export interface ObjectScanReport {
  readonly hits: readonly ObjectHit[];
  readonly skipped: readonly ObjectScanSkipped[];
}

const OBJ_BYTES = Array.from(new TextEncoder().encode("obj"));
const OBJ_LEN = OBJ_BYTES.length;

const DIGIT_0 = 0x30;
const DIGIT_9 = 0x39;

const DECIMAL_RADIX = 10;

interface BackwardHeader {
  readonly objectNumberValue: number;
  readonly generationValue: number;
  readonly headerOffset: number;
}

/**
 * 指定バイトが ASCII 数字（0-9）か判定する。
 *
 * @param byte - 判定対象のバイト値
 * @returns 数字であれば `true`
 */
function isDigit(byte: number): boolean {
  return byte >= DIGIT_0 && byte <= DIGIT_9;
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
    if (!Number.isSafeInteger(value)) {
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
 * @returns 抽出に成功した場合のヘッダ情報、構造が壊れている場合は `undefined`
 */
function readHeaderBackward(
  data: Uint8Array,
  objKeywordPos: number,
): BackwardHeader | undefined {
  let i = objKeywordPos - 1;

  if (i < 0 || !isPdfWhitespace(data[i])) {
    return undefined;
  }
  while (i >= 0 && isPdfWhitespace(data[i])) {
    i--;
  }

  const genEnd = i;
  while (i >= 0 && isDigit(data[i])) {
    i--;
  }
  const genStart = i + 1;
  if (genStart > genEnd) {
    return undefined;
  }
  const generationValue = readDigits(data, genStart, genEnd + 1);

  if (i < 0 || !isPdfWhitespace(data[i])) {
    return undefined;
  }
  while (i >= 0 && isPdfWhitespace(data[i])) {
    i--;
  }

  const objEnd = i;
  while (i >= 0 && isDigit(data[i])) {
    i--;
  }
  const objStart = i + 1;
  if (objStart > objEnd) {
    return undefined;
  }
  const objectNumberValue = readDigits(data, objStart, objEnd + 1);

  return {
    objectNumberValue,
    generationValue,
    headerOffset: objStart,
  };
}

/**
 * data 全域を 1 パス走査して `\d+ \d+ obj` ヘッダ候補を列挙する。
 * O(N)。検出された候補は `ObjectNumber.create` / `GenerationNumber.create` で
 * 検証し、`Err` となった候補は `skipped` に記録する。
 *
 * @param data - PDF ファイル全体のバイト配列
 * @returns 検出された ObjectHit[] と skip 情報
 */
export function scanObjectHeaders(data: Uint8Array): ObjectScanReport {
  const hits: ObjectHit[] = [];
  const skipped: ObjectScanSkipped[] = [];

  for (let i = 0; i + OBJ_LEN <= data.length; i++) {
    if (!matchesBytesAt(data, i, OBJ_BYTES)) {
      continue;
    }
    const afterPos = i + OBJ_LEN;
    if (afterPos < data.length && !isPdfTokenBoundary(data[afterPos])) {
      continue;
    }
    const header = readHeaderBackward(data, i);
    if (header === undefined) {
      continue;
    }
    if (
      header.headerOffset > 0 &&
      !isPdfTokenBoundary(data[header.headerOffset - 1])
    ) {
      continue;
    }

    const objectNumberResult = ObjectNumberCompanion.create(
      header.objectNumberValue,
    );
    if (!objectNumberResult.ok) {
      skipped.push({
        offset: ByteOffsetCompanion.of(header.headerOffset),
        reason: "object-number-invalid",
      });
      continue;
    }

    const generationResult = GenerationNumberCompanion.create(
      header.generationValue,
    );
    if (!generationResult.ok) {
      skipped.push({
        offset: ByteOffsetCompanion.of(header.headerOffset),
        reason: "generation-out-of-range",
      });
      continue;
    }

    hits.push({
      objectNumber: objectNumberResult.value,
      generation: generationResult.value,
      offset: ByteOffsetCompanion.of(header.headerOffset),
    });
  }

  return { hits, skipped };
}
