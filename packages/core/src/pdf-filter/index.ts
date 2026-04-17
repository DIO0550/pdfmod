import type { PdfParseError, PdfParseErrorCode } from "../errors/index";
import type { PdfValue } from "../types/pdf-types/index";
import type { Result } from "../utils/result/index";
import { err, ok } from "../utils/result/index";

/** PDF ストリーム辞書の /Filter エントリを検証するユーティリティ。 */
export const PdfFilter = {
  /**
   * /Filter エントリを検証し、フィルタ名を返す。
   * 未指定時は undefined、サポート外フィルタ時はエラーを返す。
   *
   * @param entries - ストリーム辞書のエントリ
   * @param errorCode - バリデーション失敗時のエラーコード
   * @returns フィルタ名（未指定時は undefined）、またはエラー
   */
  validate(
    entries: Map<string, PdfValue>,
    errorCode: PdfParseErrorCode = "OBJECT_STREAM_INVALID",
  ): Result<string | undefined, PdfParseError> {
    const entry = entries.get("Filter");
    if (entry === undefined) {
      return ok(undefined);
    }
    // array（マルチステージフィルタ）は未サポート。
    // 実用上 ObjStm では /FlateDecode 単体がほぼ全てのため、name のみ受理する。
    if (entry.type !== "name") {
      return err({
        code: errorCode,
        message: `/Filter must be a name, got ${entry.type}`,
      });
    }
    if (entry.value !== "FlateDecode") {
      return err({
        code: errorCode,
        message: `/Filter /${entry.value} is not supported`,
      });
    }
    return ok(entry.value);
  },
} as const;
