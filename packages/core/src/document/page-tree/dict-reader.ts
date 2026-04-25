import { NumberEx } from "../../ext/number/index";
import type {
  IndirectRef,
  PdfObject,
  PdfValue,
} from "../../pdf/types/pdf-types/index";
import { none, type Option, some } from "../../utils/option/index";
import { IndirectRef as IndirectRefNs } from "./indirect-ref";
import type { PdfRectangle } from "./resolved-page";

const BOX_ELEMENT_COUNT = 4;
const DEFAULT_USER_UNIT = 1.0;

/**
 * PdfValue が integer / real なら数値を返す。その他の型・undefined は undefined。
 *
 * @param value - 判定対象
 * @returns 数値、または undefined
 */
const getNumberValue = (value: PdfValue | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value.type === "integer" || value.type === "real") {
    return value.value;
  }
  return undefined;
};

/**
 * `/MediaBox` または `/CropBox` を 4 要素 number 配列として取り出す。
 *
 * @param entries - 辞書エントリ
 * @param key - 読み取るキー名
 * @returns 4 要素 number 配列なら Some、それ以外 None
 */
export const readBoxFromDict = (
  entries: Map<string, PdfValue>,
  key: "MediaBox" | "CropBox",
): Option<PdfRectangle> => {
  const value = entries.get(key);
  if (value === undefined || value.type !== "array") {
    return none;
  }
  if (value.elements.length !== BOX_ELEMENT_COUNT) {
    return none;
  }
  const nums: number[] = [];
  for (const el of value.elements) {
    const n = getNumberValue(el);
    if (n === undefined) {
      return none;
    }
    nums.push(n);
  }
  const [llx, lly, urx, ury] = nums;
  return some([llx, lly, urx, ury] as PdfRectangle);
};

/**
 * `/Rotate` が数値として格納されていれば生値を返す。
 *
 * @param entries - 辞書エントリ
 * @returns 数値なら Some、それ以外（キー不在・非数値）は None
 */
export const readRotateFromDict = (
  entries: Map<string, PdfValue>,
): Option<number> => {
  const value = entries.get("Rotate");
  const n = getNumberValue(value);
  if (n === undefined) {
    return none;
  }
  return some(n);
};

/**
 * `/UserUnit` を正の有限数として取り出す。
 * 未定義・非数値・非有限・0 以下は 1.0 にフォールバックする。
 *
 * @param entries - 辞書エントリ
 * @returns UserUnit 数値（常に正の有限数）
 */
export const readUserUnitFromDict = (
  entries: Map<string, PdfValue>,
): number => {
  const value = entries.get("UserUnit");
  const n = getNumberValue(value);
  if (n === undefined) {
    return DEFAULT_USER_UNIT;
  }
  if (!NumberEx.isPositiveFinite(n)) {
    return DEFAULT_USER_UNIT;
  }
  return n;
};

/**
 * `/Contents` を IndirectRef / IndirectRef[] / null として取り出す。
 * 不正な番号の indirect-ref は無視される（配列要素は除外、単一参照は null）。
 *
 * @param entries - 辞書エントリ
 * @returns 単一 ref / 配列 / null
 */
export const readContentsFromDict = (
  entries: Map<string, PdfValue>,
): IndirectRef | IndirectRef[] | null => {
  const value = entries.get("Contents");
  if (value === undefined) {
    return null;
  }
  if (value.type === "indirect-ref") {
    const indirectRef = IndirectRefNs.from(value);
    if (!indirectRef.some) {
      return null;
    }
    return indirectRef.value;
  }
  if (value.type === "array") {
    const refs: IndirectRef[] = [];
    for (const el of value.elements) {
      if (el.type === "indirect-ref") {
        const indirectRef = IndirectRefNs.from(el);
        if (indirectRef.some) {
          refs.push(indirectRef.value);
        }
      }
    }
    return refs;
  }
  return null;
};

/**
 * `/Annots` を PdfObject[] として取り出す（未定義・非配列時は null）。
 *
 * @param entries - 辞書エントリ
 * @returns PdfObject 配列 or null
 */
export const readAnnotsFromDict = (
  entries: Map<string, PdfValue>,
): PdfObject[] | null => {
  const value = entries.get("Annots");
  if (value === undefined || value.type !== "array") {
    return null;
  }
  return [...value.elements];
};
