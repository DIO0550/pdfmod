import type { PdfParseError } from "../../pdf/errors/error/index";
import type { PdfWarning } from "../../pdf/errors/warning/index";
import type {
  IndirectRef,
  PdfDictionary,
  PdfValue,
} from "../../pdf/types/pdf-types/index";
import { none, type Option, some } from "../../utils/option/index";
import { err, ok, type Result } from "../../utils/result/index";
import type { InheritedAttrs } from "./inheritance-resolver";
import {
  PAGE_ROTATE_0,
  PAGE_ROTATE_90,
  PAGE_ROTATE_180,
  PAGE_ROTATE_270,
  type PageRotate,
  type PdfRectangle,
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
 * ページ属性の継承解決 utility を束ねた namespace。
 * 各メソッドは pageDict / inherited / pageLeaf を受け、対応する属性を
 * 1 つだけ解決する純関数。
 */
export const AttrResolver = {
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
  mediaBox(
    pageDict: PdfDictionary,
    inherited: InheritedAttrs,
    pageLeaf: InheritedAttrs,
    pageRef: IndirectRef,
  ): Result<PdfRectangle, PdfParseError> {
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
  },

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
  cropBox(
    pageDict: PdfDictionary,
    inherited: InheritedAttrs,
    pageLeaf: InheritedAttrs,
    mediaBoxFallback: PdfRectangle,
  ): PdfRectangle {
    if (pageDict.entries.has("CropBox")) {
      return pageLeaf.cropBox ?? mediaBoxFallback;
    }
    return inherited.cropBox ?? mediaBoxFallback;
  },

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
  rotate(
    pageDict: PdfDictionary,
    inherited: InheritedAttrs,
    pageLeaf: InheritedAttrs,
    pageRef: IndirectRef,
  ): { value: PageRotate; warning: Option<PdfWarning> } {
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
  },

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
  resources(
    pageDict: PdfDictionary,
    inherited: InheritedAttrs,
    pageLeaf: InheritedAttrs,
  ): PdfDictionary {
    if (pageDict.entries.has("Resources")) {
      return pageLeaf.resources ?? createEmptyResources();
    }
    return inherited.resources ?? createEmptyResources();
  },
} as const;
