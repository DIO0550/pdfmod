import { none, type Option, some } from "../../../utils/option/index";
import { ok, type Result } from "../../../utils/result/index";
import type { PdfError } from "../../errors/index";
import { IndirectRef } from "../indirect-ref/index";
import type { PdfObject, PdfValue } from "../pdf-types/index";

/**
 * 間接参照を解決する関数型。
 *
 * 契約: この関数は Promise を reject しない。失敗時は必ず `Result.err(PdfError)` を resolve する。
 */
export type ResolveRef = (
  ref: IndirectRef,
) => Promise<Result<PdfObject, PdfError>>;

export const ResolveRef = {
  /**
   * 間接参照を解決し、ストリームまたは辞書などの実体オブジェクトを取得する内部ヘルパー。
   *
   * @param value - 対象の PdfValue
   * @param resolveRef - 間接参照解決コールバック
   * @returns 解決された PdfObject、無効な参照の場合は Option.none、エラー時は PdfError
   */
  async object(
    value: PdfValue | undefined,
    resolveRef: ResolveRef,
  ): Promise<Result<Option<PdfObject>, PdfError>> {
    if (value === undefined) {
      return ok(none);
    }
    if (value.type !== "indirect-ref") {
      return ok(some(value));
    }
    const refOpt = IndirectRef.from(value);
    if (!refOpt.some) {
      return ok(none);
    }
    const resolvedResult = await resolveRef(refOpt.value);
    if (!resolvedResult.ok) {
      return resolvedResult;
    }
    return ok(some(resolvedResult.value));
  },
} as const;
