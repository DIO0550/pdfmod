import type { Result } from "../../utils/result/index";
import { err, ok } from "../../utils/result/index";
import type { PdfParseError } from "../errors/index";
import type { PdfValue } from "../types/pdf-types/index";

/** PDF ストリーム辞書の /Filter エントリを検証するユーティリティ。 */
export const PdfFilter = {
  /**
   * /Filter エントリを検証し、フィルタ名を返す。
   * 未指定時は undefined、サポート外フィルタ・型不正時は
   * `PDF_FILTER_UNSUPPORTED` エラーを返す。
   *
   * @param entries - ストリーム辞書のエントリ
   * @returns フィルタ名（未指定時は undefined）、または `PDF_FILTER_UNSUPPORTED` エラー
   */
  parse(
    entries: Map<string, PdfValue>,
  ): Result<string | undefined, PdfParseError> {
    const entry = entries.get("Filter");
    if (entry === undefined) {
      return ok(undefined);
    }
    // array（マルチステージフィルタ）は未サポート。
    // 実用上 ObjStm では /FlateDecode 単体がほぼ全てのため、name のみ受理する。
    if (entry.type !== "name") {
      return err({
        code: "PDF_FILTER_UNSUPPORTED",
        message: `/Filter must be a name, got ${entry.type}`,
      });
    }
    if (entry.value !== "FlateDecode") {
      return err({
        code: "PDF_FILTER_UNSUPPORTED",
        message: `/Filter /${entry.value} is not supported`,
      });
    }
    return ok(entry.value);
  },
} as const;
