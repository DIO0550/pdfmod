import type { PdfWarning } from "../pdf/errors/warning/index";
import type { PdfString } from "../pdf/types/pdf-types/index";
import { decodePdfDocEncoding } from "./pdf-doc-encoding";

/** UTF-16BE BOM (Byte Order Mark) の 1 バイト目。 */
const UTF16_BE_BOM_BYTE_0 = 0xfe;
/** UTF-16BE BOM の 2 バイト目。 */
const UTF16_BE_BOM_BYTE_1 = 0xff;
/** UTF-16BE BOM のバイト数。 */
const BOM_LENGTH = 2;

/**
 * 入力バイト列が UTF-16BE BOM (0xFE 0xFF) で始まるかを判定する。
 *
 * @param bytes - 入力バイト列
 * @returns BOM で始まる場合 true
 */
const isUtf16BeBom = (bytes: Uint8Array): boolean => {
  if (bytes.length < BOM_LENGTH) {
    return false;
  }
  return bytes[0] === UTF16_BE_BOM_BYTE_0 && bytes[1] === UTF16_BE_BOM_BYTE_1;
};

/**
 * PdfString の bytes を JavaScript 文字列に復号する。
 *
 * 分岐:
 *  - 空バイト列 → `""`（警告なし、正常扱い）
 *  - BOM 単独 (0xFE 0xFF のみ) → `""`（警告なし、正常扱い）
 *  - 先頭 0xFE 0xFF + payload → UTF-16BE 厳密復号 (`fatal:true`)。
 *    `TextDecoder` のコンストラクタ呼び出しも try 内に置くことで、未対応環境
 *    （`utf-16be` ラベル拒否等）でも例外を `STRING_DECODE_FAILED` 警告に正規化する。
 *  - BOM なし → {@link decodePdfDocEncoding} に委譲（PDFDocEncoding 経路は常に string）
 *
 * @param pdfString - 入力 PdfString
 * @param fieldName - 警告メッセージに含めるフィールド名（例: `"Title"`）
 * @param warnings - 警告蓄積先（mutable）
 * @returns 復号成功時は文字列。UTF-16BE が fatal に失敗した場合のみ undefined
 */
export const decodePdfString = (
  pdfString: PdfString,
  fieldName: string,
  warnings: PdfWarning[],
): string | undefined => {
  const bytes = pdfString.value;
  if (bytes.length === 0) {
    return "";
  }
  if (!isUtf16BeBom(bytes)) {
    return decodePdfDocEncoding(bytes, fieldName, warnings);
  }
  if (bytes.length === BOM_LENGTH) {
    return "";
  }
  try {
    const decoder = new TextDecoder("utf-16be", { fatal: true });
    return decoder.decode(bytes.subarray(BOM_LENGTH));
  } catch {
    warnings.push({
      code: "STRING_DECODE_FAILED",
      message: `UTF-16BE decode failed for /${fieldName}`,
    });
    return undefined;
  }
};
