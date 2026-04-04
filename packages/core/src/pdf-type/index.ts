import type { PdfParseError, PdfParseErrorCode } from "../errors/index";
import type { Result } from "../result/index";
import { err, ok } from "../result/index";
import type { PdfObject } from "../types/pdf-types/index";

/** PDF 辞書の /Type エントリを検証するユーティリティ。 */
export const PdfType = {
  /**
   * /Type エントリが期待する名前と一致するか検証する。
   *
   * @param entries - 辞書のエントリ
   * @param expected - 期待する /Type の値（例: "ObjStm"）
   * @param errorCode - バリデーション失敗時のエラーコード
   * @returns 成功時は void、失敗時はエラー
   */
  validate(
    entries: Map<string, PdfObject>,
    expected: string,
    errorCode: PdfParseErrorCode,
  ): Result<void, PdfParseError> {
    const entry = entries.get("Type");
    if (entry === undefined || entry.type !== "name") {
      return err({
        code: errorCode,
        message: `Dictionary missing /Type or /Type is not a name`,
      });
    }
    if (entry.value !== expected) {
      return err({
        code: errorCode,
        message: `/Type must be /${expected}, got /${entry.value}`,
      });
    }
    return ok(undefined);
  },
} as const;
