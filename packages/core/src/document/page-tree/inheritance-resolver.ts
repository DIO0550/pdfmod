import type { PdfParseError } from "../../pdf/errors/error/index";
import type { PdfWarning } from "../../pdf/errors/warning/index";
import type {
  IndirectRef,
  PdfDictionary,
  PdfObject,
  PdfValue,
} from "../../pdf/types/pdf-types/index";
import { none, type Option, some } from "../../utils/option/index";
import { err, ok, type Result } from "../../utils/result/index";
import {
  PAGE_ROTATE_0,
  PAGE_ROTATE_90,
  PAGE_ROTATE_180,
  PAGE_ROTATE_270,
  type PageRotate,
  type ResolvedPage,
} from "./resolved-page";

/** Walker が祖先チェーンから積み上げた継承可能属性（未設定は undefined）。 */
export interface InheritedAttrs {
  mediaBox?: [number, number, number, number];
  resources?: PdfDictionary;
  cropBox?: [number, number, number, number];
  rotate?: number;
}

/** `InheritanceResolver.resolve` の出力。 */
export interface ResolveInheritedOutcome {
  page: ResolvedPage;
  warnings: PdfWarning[];
}

const ROTATE_DIVISOR = 90;
const ROTATE_FULL = 360;
const BOX_ELEMENT_COUNT = 4;
const DEFAULT_USER_UNIT = 1.0;

const EMPTY_RESOURCES: PdfDictionary = Object.freeze({
  type: "dictionary" as const,
  entries: new Map<string, PdfValue>(),
});

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
const readBoxFromDict = (
  entries: Map<string, PdfValue>,
  key: "MediaBox" | "CropBox",
): Option<[number, number, number, number]> => {
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
  return some([llx, lly, urx, ury] as [number, number, number, number]);
};

/**
 * `/Rotate` が数値として格納されていれば生値を返す。
 * キー自体の有無判定は呼び出し側が `entries.has("Rotate")` で行う。
 *
 * @param entries - 辞書エントリ
 * @returns 数値なら Some、それ以外（キー不在・非数値）は None
 */
const readRotateFromDict = (entries: Map<string, PdfValue>): Option<number> => {
  const value = entries.get("Rotate");
  const n = getNumberValue(value);
  if (n === undefined) {
    return none;
  }
  return some(n);
};

/**
 * `/UserUnit` を number として取り出す（未定義・非数値時は 1.0）。
 *
 * @param entries - 辞書エントリ
 * @returns UserUnit 数値
 */
const readUserUnitFromDict = (entries: Map<string, PdfValue>): number => {
  const value = entries.get("UserUnit");
  const n = getNumberValue(value);
  if (n === undefined) {
    return DEFAULT_USER_UNIT;
  }
  return n;
};

/**
 * `/Contents` を IndirectRef / IndirectRef[] / null として取り出す。
 *
 * @param entries - 辞書エントリ
 * @returns 単一 ref / 配列 / null
 */
const readContentsFromDict = (
  entries: Map<string, PdfValue>,
): IndirectRef | IndirectRef[] | null => {
  const value = entries.get("Contents");
  if (value === undefined) {
    return null;
  }
  if (value.type === "indirect-ref") {
    return {
      objectNumber: value.objectNumber as IndirectRef["objectNumber"],
      generationNumber:
        value.generationNumber as IndirectRef["generationNumber"],
    };
  }
  if (value.type === "array") {
    const refs: IndirectRef[] = [];
    for (const el of value.elements) {
      if (el.type === "indirect-ref") {
        refs.push({
          objectNumber: el.objectNumber as IndirectRef["objectNumber"],
          generationNumber:
            el.generationNumber as IndirectRef["generationNumber"],
        });
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
const readAnnotsFromDict = (
  entries: Map<string, PdfValue>,
): PdfObject[] | null => {
  const value = entries.get("Annots");
  if (value === undefined || value.type !== "array") {
    return null;
  }
  return [...value.elements];
};

/**
 * 生の /Rotate 数値を 0/90/180/270 に射影する。
 *
 * @param raw - 生数値
 * @returns 正規化後の PageRotate
 */
const projectRotate = (raw: number): PageRotate => {
  const normalized =
    (((Math.round(raw / ROTATE_DIVISOR) * ROTATE_DIVISOR) % ROTATE_FULL) +
      ROTATE_FULL) %
    ROTATE_FULL;
  if (normalized === PAGE_ROTATE_90) {
    return PAGE_ROTATE_90;
  }
  if (normalized === PAGE_ROTATE_180) {
    return PAGE_ROTATE_180;
  }
  if (normalized === PAGE_ROTATE_270) {
    return PAGE_ROTATE_270;
  }
  return PAGE_ROTATE_0;
};

/**
 * IH-004: `/Rotate` を正規化する。
 *
 * ページ側 /Rotate キーの存在有無で完全に分岐する（IH-001 優先）。
 * - rawKeyPresent=true かつ非数値 → INVALID_ROTATE + 0（継承無視）
 * - rawKeyPresent=true かつ 90 の倍数 → 警告なし + 正規化値
 * - rawKeyPresent=true かつ 90 の非倍数 → INVALID_ROTATE + 正規化値
 * - rawKeyPresent=false → inheritedRotate を射影（警告なし）
 *
 * @param rawPage - ページ側 /Rotate の生数値（数値でなければ undefined）
 * @param rawKeyPresent - ページ辞書に /Rotate キーが存在するか
 * @param inheritedRotate - 継承された生数値（未継承なら undefined）
 * @param pageRef - 警告メッセージに含めるページ参照
 * @returns 正規化値と警告（あれば）
 */
const normalizeRotate = (
  rawPage: number | undefined,
  rawKeyPresent: boolean,
  inheritedRotate: number | undefined,
  pageRef: IndirectRef,
): { value: PageRotate; warning: Option<PdfWarning> } => {
  if (!rawKeyPresent) {
    if (inheritedRotate === undefined) {
      return { value: PAGE_ROTATE_0, warning: none };
    }
    return { value: projectRotate(inheritedRotate), warning: none };
  }
  if (rawPage === undefined) {
    return {
      value: PAGE_ROTATE_0,
      warning: some({
        code: "INVALID_ROTATE",
        message: `Page ${pageRef.objectNumber} ${pageRef.generationNumber}: /Rotate is not a number, defaulting to 0`,
      }),
    };
  }
  const normalized = projectRotate(rawPage);
  const isMultipleOf90 = rawPage % ROTATE_DIVISOR === 0;
  if (isMultipleOf90) {
    return { value: normalized, warning: none };
  }
  return {
    value: normalized,
    warning: some({
      code: "INVALID_ROTATE",
      message: `Page ${pageRef.objectNumber} ${pageRef.generationNumber}: /Rotate ${rawPage} normalized to ${normalized}`,
    }),
  };
};

/**
 * ページ属性を継承と合成して `ResolvedPage` を生成する。
 * ISO 32000-2:2020 § 7.7.3.4 Page objects 準拠。
 */
export const InheritanceResolver = {
  /**
   * 葉ノードのページ属性を継承解決する。
   *
   * @param pageDict - ページ辞書本体
   * @param inherited - 祖先から積み上げた継承可能属性
   * @param pageLeaf - Walker が事前解決したページ直属の属性
   * @param pageRef - ページオブジェクトへの参照
   * @returns 成功時は `Ok<ResolveInheritedOutcome>`、IH-003 時は `MEDIABOX_NOT_FOUND`
   */
  resolve(
    pageDict: PdfDictionary,
    inherited: InheritedAttrs,
    pageLeaf: InheritedAttrs,
    pageRef: IndirectRef,
  ): Result<ResolveInheritedOutcome, PdfParseError> {
    const warnings: PdfWarning[] = [];

    const mediaBox = pageLeaf.mediaBox ?? inherited.mediaBox;
    if (mediaBox === undefined) {
      return err({
        code: "MEDIABOX_NOT_FOUND",
        message: `Page ${pageRef.objectNumber} ${pageRef.generationNumber}: MediaBox not found in page or ancestors`,
      });
    }

    const cropBox = pageLeaf.cropBox ?? inherited.cropBox ?? mediaBox;

    const rawKeyPresent = pageDict.entries.has("Rotate");
    const normalized = normalizeRotate(
      pageLeaf.rotate,
      rawKeyPresent,
      inherited.rotate,
      pageRef,
    );
    if (normalized.warning.some) {
      warnings.push(normalized.warning.value);
    }

    const resources =
      pageLeaf.resources ?? inherited.resources ?? EMPTY_RESOURCES;

    const page: ResolvedPage = {
      mediaBox,
      resources,
      cropBox,
      rotate: normalized.value,
      contents: readContentsFromDict(pageDict.entries),
      annots: readAnnotsFromDict(pageDict.entries),
      userUnit: readUserUnitFromDict(pageDict.entries),
      objectRef: pageRef,
    };

    return ok({ page, warnings });
  },
} as const;

/** Walker 内部で共有する純粋ヘルパ（本モジュールのみ公開）。 */
export const InheritanceResolverHelpers = {
  readBoxFromDict,
  readRotateFromDict,
  readUserUnitFromDict,
  readContentsFromDict,
  readAnnotsFromDict,
  normalizeRotate,
  projectRotate,
  EMPTY_RESOURCES,
} as const;
