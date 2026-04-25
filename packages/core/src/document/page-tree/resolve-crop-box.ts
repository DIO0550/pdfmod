import type { PdfDictionary } from "../../pdf/types/pdf-types/index";
import type { InheritedAttrs } from "./inheritance-resolver";
import type { PdfRectangle } from "./resolved-page";

/**
 * `/CropBox` を解決する。
 * ページ辞書に /CropBox キーがあれば pageLeaf、なければ inherited を採用し、
 * どちらも undefined のときは mediaBox にフォールバック。
 *
 * @param pageDict - ページ辞書本体
 * @param inherited - 祖先継承属性
 * @param pageLeaf - ページ直属の事前解決属性
 * @param mediaBoxFallback - 解決できない場合に返す MediaBox
 * @returns 解決済み CropBox
 */
export const resolveCropBox = (
  pageDict: PdfDictionary,
  inherited: InheritedAttrs,
  pageLeaf: InheritedAttrs,
  mediaBoxFallback: PdfRectangle,
): PdfRectangle => {
  if (pageDict.entries.has("CropBox")) {
    return pageLeaf.cropBox ?? mediaBoxFallback;
  }
  return inherited.cropBox ?? mediaBoxFallback;
};
