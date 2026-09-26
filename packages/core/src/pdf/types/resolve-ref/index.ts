import type { Result } from "../../../utils/result/index";
import type { PdfError } from "../../errors/index";
import type { IndirectRef } from "../indirect-ref/index";
import type { PdfObject } from "../pdf-types/index";

/**
 * 間接参照を解決する関数型。
 *
 * 契約: この関数は Promise を reject しない。失敗時は必ず `Result.err(PdfError)` を resolve する。
 */
export type ResolveRef = (
  ref: IndirectRef,
) => Promise<Result<PdfObject, PdfError>>;
