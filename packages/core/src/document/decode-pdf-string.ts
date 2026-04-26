import type { PdfWarning } from "../pdf/errors/warning/index";
import type { PdfString } from "../pdf/types/pdf-types/index";
import { decodePdfDocEncoding } from "./pdf-doc-encoding";

/** UTF-16BE BOM (Byte Order Mark) の 1 バイト目。 */
const UTF16_BE_BOM_BYTE_0 = 0xfe;
/** UTF-16BE BOM の 2 バイト目。 */
const UTF16_BE_BOM_BYTE_1 = 0xff;
/** BOM のバイト数。 */
const BOM_LENGTH = 2;

/**
 * PdfString の bytes を JavaScript 文字列に復号する。
 *
 * - 空バイト列 → `""`（警告なし）
 *
 * @param pdfString - 入力 PdfString
 * @param fieldName - 警告メッセージに含めるフィールド名
 * @param warnings - 警告蓄積先（mutable）
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
  if (
    bytes.length >= BOM_LENGTH &&
    bytes[0] === UTF16_BE_BOM_BYTE_0 &&
    bytes[1] === UTF16_BE_BOM_BYTE_1
  ) {
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
  }
  return decodePdfDocEncoding(bytes, fieldName, warnings);
};
