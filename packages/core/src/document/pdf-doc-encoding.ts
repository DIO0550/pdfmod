import type { PdfWarning } from "../pdf/errors/warning/index";

/**
 * 未割当バイト検出時に出力する Unicode 置換文字 (U+FFFD)。
 */
export const REPLACEMENT_CHAR = "�";

/** PDFDocEncoding テーブルのエントリ数（1 バイト = 256 値）。 */
const TABLE_SIZE = 256;

/**
 * ISO 32000-1 Annex D.2 (Table D.2) で定義される PDFDocEncoding テーブル。
 *
 * 256 エントリの配列で、各 byte (0x00..0xFF) に対応する Unicode 文字を保持する。
 * 未割当のバイトは `undefined`。
 */
export const PDF_DOC_ENCODING: ReadonlyArray<string | undefined> = Array.from({
  length: TABLE_SIZE,
});

/**
 * PDFDocEncoding バイト列を JavaScript 文字列にデコードする。
 *
 * @param bytes - 入力バイト列
 * @param fieldName - エラーメッセージに含めるフィールド名 (`Title` 等)
 * @param warnings - 警告蓄積先（mutable）
 * @returns デコード結果文字列（未割当バイト混入時も常に string）
 */
export const decodePdfDocEncoding = (
  _bytes: Uint8Array,
  _fieldName: string,
  _warnings: PdfWarning[],
): string => {
  return "";
};
