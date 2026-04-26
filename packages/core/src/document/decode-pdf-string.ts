import type { PdfWarning } from "../pdf/errors/warning/index";
import type { PdfString } from "../pdf/types/pdf-types/index";
import { decodePdfDocEncoding } from "./pdf-doc-encoding";

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
  return decodePdfDocEncoding(bytes, fieldName, warnings);
};
