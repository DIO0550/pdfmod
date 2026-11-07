import type { PdfDictionary, PdfObject } from "../../../pdf/types/index";
import { none, type Option, some } from "../../../utils/option/index";

/** ソフトマスクの解除、または未描画の辞書。内部の透明グループは描画層で解釈する。 */
export type SoftMask =
  | { readonly type: "None" }
  | { readonly type: "dictionary"; readonly dictionary: PdfDictionary };

export const SoftMask = {
  /** @returns ソフトマスクを使用しない状態 */
  none(): SoftMask {
    return { type: "None" };
  },
  /**
   * /SMask の直接値を読む。
   * @param object - 間接参照を解決済みの値
   * @returns 辞書または /None 以外なら None
   */
  fromObject(object: PdfObject): Option<SoftMask> {
    if (object.type === "dictionary") {
      return some({ type: "dictionary", dictionary: object });
    }

    const disabled = object.type === "name" && object.value === "None";
    return disabled ? some(SoftMask.none()) : none;
  },
} as const;
