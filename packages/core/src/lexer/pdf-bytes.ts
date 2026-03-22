/** PDFホワイトスペースバイト (ISO 32000 Table 1): NUL, TAB, LF, FF, CR, SPACE */
const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);

/** PDF区切り文字バイト (ISO 32000 Table 2): ( ) < > [ ] { } / % */
const DELIMITER = new Set([
  0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25,
]);

/**
 * 指定バイトがPDFホワイトスペース文字かどうかを判定する。
 * ISO 32000 Table 1 で定義されるホワイトスペース文字（0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20）を判定する。
 *
 * @param byte - 判定対象のバイト値
 * @returns ホワイトスペース文字であれば `true`
 *
 * @example
 * ```ts
 * isPdfWhitespace(0x20); // true (SPACE)
 * isPdfWhitespace(0x41); // false ('A')
 * ```
 */
export function isPdfWhitespace(byte: number): boolean {
  return WHITESPACE.has(byte);
}

/**
 * 指定バイトがPDF区切り文字かどうかを判定する。
 * ISO 32000 Table 2 で定義される区切り文字を判定する。
 *
 * @param byte - 判定対象のバイト値
 * @returns 区切り文字であれば `true`
 *
 * @example
 * ```ts
 * isPdfDelimiter(0x28); // true ('(')
 * isPdfDelimiter(0x41); // false ('A')
 * ```
 */
export function isPdfDelimiter(byte: number): boolean {
  return DELIMITER.has(byte);
}

/**
 * 指定バイトがPDFトークン境界（ホワイトスペースまたは区切り文字）かどうかを判定する。
 *
 * @param byte - 判定対象のバイト値
 * @returns トークン境界であれば `true`
 *
 * @example
 * ```ts
 * isPdfTokenBoundary(0x20); // true (SPACE)
 * isPdfTokenBoundary(0x28); // true ('(')
 * isPdfTokenBoundary(0x41); // false ('A')
 * ```
 */
export function isPdfTokenBoundary(byte: number): boolean {
  return WHITESPACE.has(byte) || DELIMITER.has(byte);
}

/**
 * ホワイトスペースとコメントをスキップして次の有効バイト位置を返す。
 * コメントは `%` から行末（LF/CR）までの範囲。
 *
 * @param data - PDFバイト配列
 * @param pos - スキップ開始位置
 * @param end - スキャン上限位置（省略時は配列末尾）
 * @returns スキップ後の位置（次の有効バイトのインデックス）
 *
 * @example
 * ```ts
 * const data = new Uint8Array([0x20, 0x20, 0x41]); // "  A"
 * skipWhitespaceAndComments(data, 0); // 2（'A'の位置）
 * ```
 */
export function skipWhitespaceAndComments(
  data: Uint8Array,
  pos: number,
  end?: number,
): number {
  const limit = end ?? data.length;
  let i = pos;
  while (i < limit) {
    if (isPdfWhitespace(data[i])) {
      i++;
      continue;
    }
    if (data[i] === 0x25) {
      i++;
      while (i < limit && data[i] !== 0x0a && data[i] !== 0x0d) {
        i++;
      }
      continue;
    }
    break;
  }
  return i;
}
