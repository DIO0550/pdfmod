import { NumberEx } from "../../../ext/number/index";
import { IndirectRef } from "../../../pdf/types/indirect-ref/index";
import { type PdfObject, PdfValue } from "../../../pdf/types/pdf-types/index";
import { none, type Option, some } from "../../../utils/option/index";
import { PdfRectangle } from "../resolved-page";

const BOX_ELEMENT_COUNT = 4;
const DEFAULT_USER_UNIT = 1.0;

/**
 * ページ辞書 (`/Page` / `/Pages`) からの属性読み取り utility を束ねた namespace。
 */
export const DictReader = {
  /**
   * 解決済みの `/MediaBox` / `/CropBox` 値を 4 要素 number 配列として取り出す。
   * 間接参照は呼び出し側で解決済みであることを前提とする。
   * 任意の対角 2 点で指定された矩形は `PdfRectangle.normalize` で左下・右上の順
   * `[llx, lly, urx, ury]` に正規化して返す（ISO 32000-1 §7.9.5）。正規化しても警告は出さない。
   *
   * @param value - 解決済みの値（キー不在なら undefined）
   * @returns 4 要素 number 配列なら正規化済みの Some、それ以外 None
   */
  box(value: PdfValue | undefined): Option<PdfRectangle> {
    if (value === undefined || value.type !== "array") {
      return none;
    }
    if (value.elements.length !== BOX_ELEMENT_COUNT) {
      return none;
    }
    const nums: number[] = [];
    for (const el of value.elements) {
      const nOpt = PdfValue.asNumber(el);
      if (!nOpt.some) {
        return none;
      }
      nums.push(nOpt.value);
    }
    const [x1, y1, x2, y2] = nums;
    return some(PdfRectangle.normalize([x1, y1, x2, y2]));
  },

  /**
   * 解決済みの `/Rotate` 値が数値として格納されていれば生値を返す。
   *
   * @param value - 解決済みの値（キー不在なら undefined）
   * @returns 数値なら Some、それ以外（undefined・非数値）は None
   */
  rotate(value: PdfValue | undefined): Option<number> {
    return PdfValue.asNumber(value);
  },

  /**
   * `/UserUnit` を正の有限数として取り出す。
   * 未定義・非数値・非有限・0 以下は 1.0 にフォールバックする。
   *
   * @param entries - 辞書エントリ
   * @returns UserUnit 数値（常に正の有限数）
   */
  userUnit(entries: Map<string, PdfValue>): number {
    const value = entries.get("UserUnit");
    const nOpt = PdfValue.asNumber(value);
    if (!nOpt.some) {
      return DEFAULT_USER_UNIT;
    }
    if (!NumberEx.isPositiveFinite(nOpt.value)) {
      return DEFAULT_USER_UNIT;
    }
    return nOpt.value;
  },

  /**
   * `/Contents` を単一 IndirectRef または IndirectRef 配列として取り出す。
   * 不正な番号の indirect-ref は無視される（配列要素は除外、単一参照は `none`）。
   *
   * @param entries - 辞書エントリ
   * @returns 単一参照なら `some(IndirectRef)`、配列なら有効な参照だけを集めた `some(IndirectRef[])`
   *          （有効な要素が 0 件でも `some([])`）。キー不在・不正な単一参照・その他の型は `none`
   */
  contents(
    entries: Map<string, PdfValue>,
  ): Option<IndirectRef | IndirectRef[]> {
    const value = entries.get("Contents");
    if (value === undefined) {
      return none;
    }
    if (value.type === "indirect-ref") {
      // Option<IndirectRef> は Option<IndirectRef | IndirectRef[]> に代入可能なため
      // 開いて詰め直さずそのまま返す（番号が不正なら from が none を返す）。
      return IndirectRef.from(value);
    }
    if (value.type === "array") {
      const refs: IndirectRef[] = [];
      for (const el of value.elements) {
        if (el.type === "indirect-ref") {
          const indirectRef = IndirectRef.from(el);
          if (indirectRef.some) {
            refs.push(indirectRef.value);
          }
        }
      }
      return some(refs);
    }
    return none;
  },

  /**
   * `/Annots` を PdfObject 配列として取り出す。
   * 返す配列は元の要素列の浅い複製で、呼び出し側の変更は元の辞書に波及しない。
   *
   * @param entries - 辞書エントリ
   * @returns 配列なら `some(PdfObject[])`（空配列でも `some([])`）、キー不在・非配列は `none`
   */
  annots(entries: Map<string, PdfValue>): Option<PdfObject[]> {
    const value = entries.get("Annots");
    if (value === undefined || value.type !== "array") {
      return none;
    }
    return some([...value.elements]);
  },
} as const;
