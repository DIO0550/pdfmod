import type { PdfParseError } from "../../../pdf/errors/error/index";
import type { PdfWarning } from "../../../pdf/errors/warning/index";
import type {
  IndirectRef,
  PdfDictionary,
  PdfValue,
} from "../../../pdf/types/pdf-types/index";
import { none, type Option, some } from "../../../utils/option/index";
import { err, ok, type Result } from "../../../utils/result/index";
import type { InheritedAttrs } from "../inheritance-resolver";
import {
  PAGE_ROTATE_0,
  PAGE_ROTATE_90,
  PAGE_ROTATE_180,
  PAGE_ROTATE_270,
  type PageRotate,
  type PdfRectangle,
} from "../resolved-page";

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
 * 各メソッドは inherited / pageLeaf を受け、対応する属性を 1 つだけ解決する純関数。
 * 「局所値が無効だったか」は pageLeaf の undefined として表現され、
 * その場合は継承値へフォールバックする（無効の報告は Walker 側の責務）。
 */
export const AttrResolver = {
  /**
   * `/MediaBox` を解決する。
   * ページ直属の有効値があればそれを、なければ祖先の継承値を採用する。
   * どちらも無いときだけ `MEDIABOX_NOT_FOUND` Err。
   * 局所値が無効だった場合は Walker 側で警告済みで、ここには undefined として届く。
   *
   * @param inherited - 祖先継承属性
   * @param pageLeaf - ページ直属の事前解決属性
   * @param pageRef - `MEDIABOX_NOT_FOUND` エラーメッセージに含めるページ参照
   * @returns Ok(PdfRectangle) または Err(PdfParseError: `MEDIABOX_NOT_FOUND`)
   */
  mediaBox(
    inherited: InheritedAttrs,
    pageLeaf: InheritedAttrs,
    pageRef: IndirectRef,
  ): Result<PdfRectangle, PdfParseError> {
    if (pageLeaf.mediaBox !== undefined) {
      return ok(pageLeaf.mediaBox);
    }
    if (inherited.mediaBox !== undefined) {
      return ok(inherited.mediaBox);
    }
    return err({
      code: "MEDIABOX_NOT_FOUND",
      message: `Page ${pageRef.objectNumber} ${pageRef.generationNumber}: MediaBox not found in page or ancestors`,
    });
  },

  /**
   * `/CropBox` を解決する。ページ直属 → 継承 → MediaBox の順にフォールバックする。
   *
   * @param inherited - 祖先継承属性
   * @param pageLeaf - ページ直属の事前解決属性
   * @param mediaBoxFallback - どちらも無い場合に返す MediaBox
   * @returns 解決済み CropBox
   */
  cropBox(
    inherited: InheritedAttrs,
    pageLeaf: InheritedAttrs,
    mediaBoxFallback: PdfRectangle,
  ): PdfRectangle {
    return pageLeaf.cropBox ?? inherited.cropBox ?? mediaBoxFallback;
  },

  /**
   * `/Rotate` を解決する。ページ直属 → 継承 → 0 の順に採用し、90 の倍数へ射影する。
   * 90 の倍数でない生値を採用したときだけ `INVALID_ROTATE` 警告を返す
   * （非数値だった場合は Walker 側で警告済み）。
   *
   * @param inherited - 祖先継承属性
   * @param pageLeaf - ページ直属の事前解決属性
   * @param pageRef - 警告メッセージに含めるページ参照
   * @returns 正規化値と警告（あれば）
   */
  rotate(
    inherited: InheritedAttrs,
    pageLeaf: InheritedAttrs,
    pageRef: IndirectRef,
  ): { value: PageRotate; warning: Option<PdfWarning> } {
    const raw = pageLeaf.rotate ?? inherited.rotate;
    if (raw === undefined) {
      return { value: PAGE_ROTATE_0, warning: none };
    }
    const normalized = projectRotate(raw);
    const isMultipleOf90 = raw % ROTATE_DIVISOR === 0;
    if (isMultipleOf90) {
      return { value: normalized, warning: none };
    }
    return {
      value: normalized,
      warning: some({
        code: "INVALID_ROTATE",
        message: `Page ${pageRef.objectNumber} ${pageRef.generationNumber}: /Rotate ${raw} normalized to ${normalized}`,
      }),
    };
  },

  /**
   * `/Resources` を解決する。ページ直属 → 継承 → 空辞書（毎回新規）の順に採用する。
   *
   * @param inherited - 祖先継承属性
   * @param pageLeaf - ページ直属の事前解決属性
   * @returns 解決済み Resources 辞書
   */
  resources(
    inherited: InheritedAttrs,
    pageLeaf: InheritedAttrs,
  ): PdfDictionary {
    return pageLeaf.resources ?? inherited.resources ?? createEmptyResources();
  },
} as const;
