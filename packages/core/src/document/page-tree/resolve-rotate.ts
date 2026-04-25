import type { PdfWarning } from "../../pdf/errors/warning/index";
import type {
  IndirectRef,
  PdfDictionary,
} from "../../pdf/types/pdf-types/index";
import { none, type Option, some } from "../../utils/option/index";
import type { InheritedAttrs } from "./inheritance-resolver";
import {
  PAGE_ROTATE_0,
  PAGE_ROTATE_90,
  PAGE_ROTATE_180,
  PAGE_ROTATE_270,
  type PageRotate,
} from "./resolved-page";

const ROTATE_DIVISOR = 90;
const ROTATE_FULL = 360;

/**
 * 生の /Rotate 数値を 0/90/180/270 に射影する。
 * NaN / Infinity は 0 に丸める（寛容処理）。
 *
 * @param raw - 生数値
 * @returns 正規化後の PageRotate
 */
const projectRotate = (raw: number): PageRotate => {
  if (!Number.isFinite(raw)) {
    return PAGE_ROTATE_0;
  }
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
 * `/Rotate` を解決する。
 * - pageDict に /Rotate キー無し → inherited.rotate を射影（警告なし）
 * - キー有り・非数値 → { 0, INVALID_ROTATE 警告 }
 * - キー有り・90 倍数 → 正規化値・警告なし
 * - キー有り・90 非倍数 → 正規化値・INVALID_ROTATE 警告
 *
 * @param pageDict - ページ辞書本体
 * @param inherited - 祖先継承属性
 * @param pageLeaf - ページ直属の事前解決属性
 * @param pageRef - 警告メッセージに含めるページ参照
 * @returns 正規化値と警告（あれば）
 */
export const resolveRotate = (
  pageDict: PdfDictionary,
  inherited: InheritedAttrs,
  pageLeaf: InheritedAttrs,
  pageRef: IndirectRef,
): { value: PageRotate; warning: Option<PdfWarning> } => {
  const rawKeyPresent = pageDict.entries.has("Rotate");
  if (!rawKeyPresent) {
    if (inherited.rotate === undefined) {
      return { value: PAGE_ROTATE_0, warning: none };
    }
    return { value: projectRotate(inherited.rotate), warning: none };
  }
  const rawPage = pageLeaf.rotate;
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
