import type { PdfParseError } from "../../pdf/errors/error/index";
import type {
  IndirectRef,
  PdfDictionary,
} from "../../pdf/types/pdf-types/index";
import { err, ok, type Result } from "../../utils/result/index";
import type { InheritedAttrs } from "./inheritance-resolver";
import type { PdfRectangle } from "./resolved-page";

/**
 * `/MediaBox` を解決する。
 * ページ辞書に /MediaBox キーがあれば pageLeaf、なければ inherited を採用。
 * どちらも undefined のときは `MEDIABOX_NOT_FOUND` Err。
 *
 * @param pageDict - ページ辞書本体
 * @param inherited - 祖先継承属性
 * @param pageLeaf - ページ直属の事前解決属性
 * @param pageRef - `MEDIABOX_NOT_FOUND` エラーメッセージに含めるページ参照
 * @returns Ok(PdfRectangle) または Err(PdfParseError: `MEDIABOX_NOT_FOUND`)
 */
export const resolveMediaBox = (
  pageDict: PdfDictionary,
  inherited: InheritedAttrs,
  pageLeaf: InheritedAttrs,
  pageRef: IndirectRef,
): Result<PdfRectangle, PdfParseError> => {
  if (pageDict.entries.has("MediaBox")) {
    if (pageLeaf.mediaBox !== undefined) {
      return ok(pageLeaf.mediaBox);
    }
  } else if (inherited.mediaBox !== undefined) {
    return ok(inherited.mediaBox);
  }
  return err({
    code: "MEDIABOX_NOT_FOUND",
    message: `Page ${pageRef.objectNumber} ${pageRef.generationNumber}: MediaBox not found in page or ancestors`,
  });
};
