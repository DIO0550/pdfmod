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
   * 直接値はそのまま返し、間接参照は同じ文書のオブジェクトに解決する。
   *
   * @param value - 読み取ったPDF値。辞書にキーがない場合は undefined
   * @param resolveRef - 間接参照解決コールバック
   * @returns 直接値または解決先は Ok(Some)。値が未指定か参照番号が不正なら Ok(None)。参照解決の失敗は元の PdfError を返す
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
