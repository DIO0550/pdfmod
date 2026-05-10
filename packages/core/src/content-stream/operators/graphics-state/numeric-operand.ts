import type { PdfObject } from "../../../pdf/types/pdf-types/index";

/**
 * `integer` または `real` の PdfObject に narrow した型。
 * graphics-state operator (cm / w / J / j / M) が期待する数値 operand の型。
 */
export type NumericPdfObject = Extract<PdfObject, { type: "integer" | "real" }>;

/**
 * PdfObject が `integer` または `real` であるかを判定する type guard。
 * 同等のインライン記述が複数の handler で重複していたため共通化。
 *
 * @param operand - 判定対象の PdfObject
 * @returns integer / real のいずれかなら true
 */
export const isNumericPdfObject = (
  operand: PdfObject,
): operand is NumericPdfObject => {
  if (operand.type === "integer") {
    return true;
  }
  if (operand.type === "real") {
    return true;
  }
  return false;
};
