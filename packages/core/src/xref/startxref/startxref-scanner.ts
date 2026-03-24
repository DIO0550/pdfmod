import type { PdfParseError } from "../../errors/index.js";
import {
  isPdfTokenBoundary,
  skipWhitespaceAndComments,
} from "../../lexer/pdf-bytes.js";
import type { Result } from "../../result/index.js";
import { err, ok } from "../../result/index.js";

const PERCENT = 0x25;

const EOF_BYTES = Array.from(new TextEncoder().encode("%%EOF"));
const EOF_LEN = EOF_BYTES.length;

const STARTXREF_BYTES = Array.from(new TextEncoder().encode("startxref"));
const STARTXREF_LEN = STARTXREF_BYTES.length;

const DIGIT_0 = 0x30;
const DIGIT_9 = 0x39;

const LF = 0x0a;
const CR = 0x0d;

const STARTXREF_SEARCH_WINDOW = 1024;
const DECIMAL_RADIX = 10;
const NOT_FOUND = -1;

/**
 * バイト列がdataの指定位置で一致するか判定する。
 *
 * @param data - 検索対象のバイト配列
 * @param offset - 比較開始位置
 * @param pattern - 一致判定するバイト列
 * @returns 一致すれば `true`
 */
function matchesBytesAt(
  data: Uint8Array,
  offset: number,
  pattern: number[],
): boolean {
  for (let j = 0; j < pattern.length; j++) {
    if (data[offset + j] !== pattern[j]) {
      return false;
    }
  }
  return true;
}

/**
 * 指定位置のトークンが前後でトークン境界を持つか判定する。
 *
 * @param data - PDFバイト配列
 * @param offset - トークン開始位置
 * @param length - トークンのバイト長
 * @param dataLength - データ全体の長さ
 * @returns 前後が境界であれば `true`
 */
function hasTokenBoundary(
  data: Uint8Array,
  offset: number,
  length: number,
  dataLength: number,
): boolean {
  if (offset > 0 && !isPdfTokenBoundary(data[offset - 1])) {
    return false;
  }
  const afterPos = offset + length;
  if (afterPos < dataLength && !isPdfTokenBoundary(data[afterPos])) {
    return false;
  }
  return true;
}

/**
 * startxref走査失敗時のエラーResultを生成するヘルパー。
 *
 * @param message - エラーメッセージ
 * @returns `Err<PdfParseError>` （コード: STARTXREF_NOT_FOUND）
 *
 * @example
 * ```ts
 * const result = failStartXRef("%%EOF not found");
 * // result = { ok: false, error: { code: "STARTXREF_NOT_FOUND", message: "%%EOF not found" } }
 * ```
 */
function failStartXRef(message: string): Result<number, PdfParseError> {
  return err({ code: "STARTXREF_NOT_FOUND", message });
}

/**
 * 指定位置がPDFコメント（% ... 行末）の内部にあるかを判定する。
 * 行頭方向に走査し、改行より先に `%` が見つかればコメント内と判定する。
 *
 * @param data - PDFバイト配列
 * @param pos - 判定対象の位置
 * @returns コメント内であれば `true`
 *
 * @example
 * ```ts
 * const data = new TextEncoder().encode("% comment\n");
 * isInsideComment(data, 5); // true
 * ```
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
 * PDFファイル末尾から `startxref` オフセットを走査・取得する。
 * ISO 32000 7.5.5 に基づき、末尾1024バイト内で %%EOF を検索し、その位置から startxref および
 * オフセット値をファイル先頭方向へ逆方向走査する。
 *
 * @param data - PDFファイル全体のバイト配列
 * @returns 成功時は `Ok<number>` でバイトオフセット値を返す。
 *   失敗時は `Err<PdfParseError>` で以下のエラーコードを返す:
 *   - `STARTXREF_NOT_FOUND`: %%EOF またはstartxrefキーワードが見つからない場合、
 *     またはオフセット値が不正な場合
 *
 * @example
 * ```ts
 * const pdfBytes = new Uint8Array([...]);
 * const result = scanStartXRef(pdfBytes);
 * if (result.ok) {
 *   console.log(`startxref offset: ${result.value}`);
 * }
 * ```
 */
export function scanStartXRef(data: Uint8Array): Result<number, PdfParseError> {
  const len = data.length;
  const tailStart = Math.max(0, len - STARTXREF_SEARCH_WINDOW);

  // Step 1: %%EOF 逆方向検索
  let eofOffset = NOT_FOUND;
  if (len < EOF_LEN) {
    return failStartXRef(
      `%%EOF not found within last ${STARTXREF_SEARCH_WINDOW} bytes`,
    );
  }

  for (let i = len - EOF_LEN; i >= tailStart; i--) {
    if (!matchesBytesAt(data, i, EOF_BYTES)) {
      continue;
    }
    if (isInsideComment(data, i)) {
      continue;
    }
    if (!hasTokenBoundary(data, i, EOF_LEN, len)) {
      continue;
    }
    eofOffset = i;
    break;
  }

  if (eofOffset < 0) {
    return failStartXRef(
      `%%EOF not found within last ${STARTXREF_SEARCH_WINDOW} bytes`,
    );
  }

  // Step 2: startxref 逆方向検索
  let startxrefOffset = NOT_FOUND;
  for (let i = eofOffset - 1; i >= 0; i--) {
    if (i + STARTXREF_LEN > len) {
      continue;
    }

    if (!matchesBytesAt(data, i, STARTXREF_BYTES)) {
      continue;
    }
    if (!hasTokenBoundary(data, i, STARTXREF_LEN, len)) {
      continue;
    }
    if (isInsideComment(data, i)) {
      continue;
    }

    startxrefOffset = i;
    break;
  }

  if (startxrefOffset < 0) {
    return failStartXRef("startxref keyword not found before %%EOF");
  }

  // Step 3: オフセット値パース
  let pos = skipWhitespaceAndComments(
    data,
    startxrefOffset + STARTXREF_LEN,
    eofOffset,
  );

  let value = 0;
  let digitsCount = 0;
  while (pos < eofOffset && data[pos] >= DIGIT_0 && data[pos] <= DIGIT_9) {
    value = value * DECIMAL_RADIX + (data[pos] - DIGIT_0);
    digitsCount++;
    if (!Number.isSafeInteger(value)) {
      return failStartXRef("invalid startxref offset value");
    }
    pos++;
  }

  if (digitsCount === 0) {
    return failStartXRef("invalid startxref offset value");
  }

  // Verify only whitespace/comments remain between digits and %%EOF
  const trailing = skipWhitespaceAndComments(data, pos, eofOffset);
  if (trailing !== eofOffset) {
    return failStartXRef("invalid startxref offset value");
  }

  if (value >= len || value >= startxrefOffset) {
    return failStartXRef("invalid startxref offset value");
  }

  return ok(value);
}
