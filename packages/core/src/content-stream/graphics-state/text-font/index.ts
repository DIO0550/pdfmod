import type { PdfDictionary } from "../../../pdf/types/index";
import { none, type Option, some } from "../../../utils/option/index";

/** Tf のローカル名と取得できた辞書、または gs /Font の辞書指定。 */
export type TextFont =
  | {
      readonly type: "name";
      readonly name: string;
      readonly dictionary?: PdfDictionary;
    }
  | { readonly type: "dictionary"; readonly dictionary: PdfDictionary };

export const TextFont = {
  /**
   * 名前指定からローカル名を取得する。
   * @param font - 現在のフォント指定
   * @returns 未指定・辞書指定では None
   */
  nameOf(font: Option<TextFont>): Option<string> {
    if (!font.some) {
      return none;
    }

    return font.value.type === "name" ? some(font.value.name) : none;
  },
} as const;
