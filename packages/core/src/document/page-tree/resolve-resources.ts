import type { PdfDictionary, PdfValue } from "../../pdf/types/pdf-types/index";
import type { InheritedAttrs } from "./inheritance-resolver";

/**
 * 空の `/Resources` 辞書を新規生成する。
 * フォールバックの度にフレッシュなインスタンスを返し、ページ間で entries が
 * 共有されないことを保証する（Object.freeze は内部 Map を不変化しないため、
 * 単一インスタンスを使い回すと cross-page contamination の恐れがある）。
 *
 * @returns 新規空辞書
 */
const createEmptyResources = (): PdfDictionary => ({
  type: "dictionary",
  entries: new Map<string, PdfValue>(),
});

/**
 * `/Resources` を解決する。
 * ページ辞書に /Resources キーがあれば pageLeaf、なければ inherited を採用し、
 * どちらも undefined のときは空辞書（毎回新規インスタンス）にフォールバック。
 *
 * @param pageDict - ページ辞書本体
 * @param inherited - 祖先継承属性
 * @param pageLeaf - ページ直属の事前解決属性
 * @returns 解決済み Resources 辞書
 */
export const resolveResources = (
  pageDict: PdfDictionary,
  inherited: InheritedAttrs,
  pageLeaf: InheritedAttrs,
): PdfDictionary => {
  const pickedFromPage = pageDict.entries.has("Resources");
  if (pickedFromPage) {
    return pageLeaf.resources ?? createEmptyResources();
  }
  return inherited.resources ?? createEmptyResources();
};
