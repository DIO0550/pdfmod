import type { Option } from "../../utils/option/index";
import { none, some } from "../../utils/option/index";
import type { PdfParseError } from "../errors/index";
import type { PdfValue } from "../types/pdf-types/index";

/** PDF 辞書の /Type エントリを検証するユーティリティ。 */
export const PdfType = {
  /**
   * /Type エントリが期待する名前と一致するか検証する。
   *
   * @param entries - 辞書のエントリ
   * @param expected - 期待する /Type の値（例: "ObjStm"）
   * @returns 成功時は `none`、失敗時は `some(PdfParseError{code: "PDF_TYPE_INVALID"})`
   */
  validate(
    entries: Map<string, PdfValue>,
    expected: string,
  ): Option<PdfParseError> {
    const entry = entries.get("Type");
    if (entry === undefined || entry.type !== "name") {
      return some({
        code: "PDF_TYPE_INVALID",
        message: `Dictionary missing /Type or /Type is not a name`,
      });
    }
    if (entry.value !== expected) {
      return some({
        code: "PDF_TYPE_INVALID",
        message: `/Type must be /${expected}, got /${entry.value}`,
      });
    }
    return none;
  },
} as const;
