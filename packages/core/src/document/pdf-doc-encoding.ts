import type { PdfWarning } from "../pdf/errors/warning/index";

/**
 * 未割当バイト検出時に出力する Unicode 置換文字 (U+FFFD)。
 */
export const REPLACEMENT_CHAR = "�";

/** PDFDocEncoding テーブルのエントリ数（1 バイト = 256 値）。 */
const TABLE_SIZE = 256;

/** ASCII 印字可能領域の下端（U+0020 SPACE）。 */
const ASCII_PRINTABLE_START = 0x20;

/** ASCII 印字可能領域の上端（U+007E TILDE）。 */
const ASCII_PRINTABLE_END = 0x7e;

/**
 * 256 エントリの PDFDocEncoding テーブルを構築する。
 *
 * @returns 各 byte に対応する Unicode 文字。未割当バイトは `undefined`。
 */
const buildTable = (): ReadonlyArray<string | undefined> => {
  const table: (string | undefined)[] = Array.from({ length: TABLE_SIZE });
  for (let i = ASCII_PRINTABLE_START; i <= ASCII_PRINTABLE_END; i++) {
    table[i] = String.fromCharCode(i);
  }
  return table;
};

/**
 * ISO 32000-1 Annex D.2 (Table D.2) で定義される PDFDocEncoding テーブル。
 *
 * 256 エントリの配列で、各 byte (0x00..0xFF) に対応する Unicode 文字を保持する。
 * 未割当のバイトは `undefined`。
 */
export const PDF_DOC_ENCODING: ReadonlyArray<string | undefined> = buildTable();

/**
 * PDFDocEncoding バイト列を JavaScript 文字列にデコードする。
 *
 * @param bytes - 入力バイト列
 * @param fieldName - エラーメッセージに含めるフィールド名 (`Title` 等)
 * @param warnings - 警告蓄積先（mutable）
 * @returns デコード結果文字列（未割当バイト混入時も常に string）
 */
export const decodePdfDocEncoding = (
  bytes: Uint8Array,
  _fieldName: string,
  _warnings: PdfWarning[],
): string => {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const ch = PDF_DOC_ENCODING[bytes[i]];
    if (ch === undefined) {
      out += REPLACEMENT_CHAR;
      continue;
    }
    out += ch;
  }
  return out;
};
