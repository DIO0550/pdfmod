import type { PdfObject } from "../../../../pdf/types/pdf-types/index";

/**
 * `integer` または `real` の PdfObject に narrow した型。
 * graphics-state operator (cm / w / J / j / M) が期待する数値 operand の型。
 */
export type NumericPdfObject = Extract<PdfObject, { type: "integer" | "real" }>;

/**
 * `NumericPdfObject` の判定関数を束ねた companion object。
 * 型と value を同一識別子で公開する declaration merging パターン。
 */
export const NumericPdfObject = {
  /**
   * PdfObject が `integer` または `real` であるかを判定する type guard。
   * graphics-state operator (cm / w / J / j / M) が共通で行う数値 operand チェック。
   *
   * @param operand - 判定対象の PdfObject
   * @returns integer / real のいずれかなら true
   */
  is(operand: PdfObject): operand is NumericPdfObject {
    if (operand.type === "integer") {
      return true;
    }
    if (operand.type === "real") {
      return true;
    }
    return false;
  },
} as const;
