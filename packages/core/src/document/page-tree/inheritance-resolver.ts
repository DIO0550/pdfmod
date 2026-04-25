import type { PdfParseError } from "../../pdf/errors/error/index";
import type { PdfWarning } from "../../pdf/errors/warning/index";
import type {
  IndirectRef,
  PdfDictionary,
} from "../../pdf/types/pdf-types/index";
import { err, ok, type Result } from "../../utils/result/index";
import {
  readAnnotsFromDict,
  readContentsFromDict,
  readUserUnitFromDict,
} from "./dict-reader";
import { resolveCropBox } from "./resolve-crop-box";
import { resolveMediaBox } from "./resolve-media-box";
import { resolveResources } from "./resolve-resources";
import { resolveRotate } from "./resolve-rotate";
import type { PdfRectangle, ResolvedPage } from "./resolved-page";

/** Walker が祖先チェーンから積み上げた継承可能属性（未設定は undefined）。 */
export interface InheritedAttrs {
  mediaBox?: PdfRectangle;
  resources?: PdfDictionary;
  cropBox?: PdfRectangle;
  rotate?: number;
}

/** `InheritanceResolver.resolve` の出力。 */
export interface ResolveInheritedOutcome {
  page: ResolvedPage;
  warnings: PdfWarning[];
}

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
   * @returns 成功時は `Ok<ResolveInheritedOutcome>`、MediaBox 未継承時は `MEDIABOX_NOT_FOUND`
   */
  resolve(
    pageDict: PdfDictionary,
    inherited: InheritedAttrs,
    pageLeaf: InheritedAttrs,
    pageRef: IndirectRef,
  ): Result<ResolveInheritedOutcome, PdfParseError> {
    const mediaBoxResult = resolveMediaBox(
      pageDict,
      inherited,
      pageLeaf,
      pageRef,
    );
    if (!mediaBoxResult.ok) {
      return err(mediaBoxResult.error);
    }
    const mediaBox = mediaBoxResult.value;
    const cropBox = resolveCropBox(pageDict, inherited, pageLeaf, mediaBox);
    const rotate = resolveRotate(pageDict, inherited, pageLeaf, pageRef);
    const resources = resolveResources(pageDict, inherited, pageLeaf);

    const warnings: PdfWarning[] = [];
    if (rotate.warning.some) {
      warnings.push(rotate.warning.value);
    }

    const page: ResolvedPage = {
      mediaBox,
      resources,
      cropBox,
      rotate: rotate.value,
      contents: readContentsFromDict(pageDict.entries),
      annots: readAnnotsFromDict(pageDict.entries),
      userUnit: readUserUnitFromDict(pageDict.entries),
      objectRef: pageRef,
    };
    return ok({ page, warnings });
  },
} as const;
