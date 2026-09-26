import type {
  PdfWarning,
  PdfWarningCode,
} from "../../../pdf/errors/warning/index";
import { IndirectRef } from "../../../pdf/types/indirect-ref/index";
import type {
  PdfArray,
  PdfIndirectRef,
  PdfValue,
} from "../../../pdf/types/pdf-types/index";
import type { ResolveRef } from "../../../pdf/types/resolve-ref/index";
import { none, type Option, some } from "../../../utils/option/index";

/** 解決失敗時に積む警告を組み立てるための文脈。 */
export interface ResolveValueContext {
  /** 警告メッセージに出す辞書キー名（先頭の "/" は付けない） */
  key: string;
  /** 間接参照解決関数 */
  resolveRef: ResolveRef;
  /** 警告の蓄積先（mutable 参照） */
  warnings: PdfWarning[];
  /** 解決に失敗したときに積む警告コード */
  warningCode: PdfWarningCode;
}

/**
 * 解決失敗の警告を積む。メッセージ書式は既存の `/Resources` 解決と揃える。
 *
 * @param ctx - 解決文脈
 * @param raw - 解決に失敗した間接参照
 * @param detail - 失敗の内訳
 */
const pushFailure = (
  ctx: ResolveValueContext,
  raw: PdfIndirectRef,
  detail: string,
): void => {
  ctx.warnings.push({
    code: ctx.warningCode,
    message: `Failed to resolve /${ctx.key} indirect-ref ${raw.objectNumber} ${raw.generationNumber}: ${detail}`,
  });
};

/**
 * 値が間接参照なら 1 段だけ解決する。直値はそのまま返す。
 * 解決先が stream の場合は PdfValue ではないため失敗として扱う。
 *
 * @param value - 対象の値
 * @param ctx - 解決文脈
 * @returns 解決済みの値、失敗時は Option.none
 */
const resolveOnce = async (
  value: PdfValue,
  ctx: ResolveValueContext,
): Promise<Option<PdfValue>> => {
  if (value.type !== "indirect-ref") {
    return some(value);
  }
  const indirectRef = IndirectRef.from(value);
  if (!indirectRef.some) {
    pushFailure(ctx, value, "invalid indirect reference");
    return none;
  }
  const resolved = await ctx.resolveRef(indirectRef.value);
  if (!resolved.ok) {
    pushFailure(ctx, value, `cause=${resolved.error.code}`);
    return none;
  }
  if (resolved.value.type === "stream") {
    pushFailure(ctx, value, "resolved to stream");
    return none;
  }
  return some(resolved.value);
};

/**
 * 配列要素のうち間接参照のものを 1 段解決した新しい配列を返す。
 * 解決に失敗した要素は元の間接参照のまま残す（後段の型検証で弾かれる）。
 * 間接参照要素が 1 つもなければ元の配列をそのまま返す。
 *
 * @param array - 対象の配列
 * @param ctx - 解決文脈
 * @returns 要素解決済みの配列
 */
const resolveElements = async (
  array: PdfArray,
  ctx: ResolveValueContext,
): Promise<PdfArray> => {
  const hasRef = array.elements.some((el) => el.type === "indirect-ref");
  if (!hasRef) {
    return array;
  }
  const elements: PdfValue[] = [];
  for (const element of array.elements) {
    if (element.type !== "indirect-ref") {
      elements.push(element);
      continue;
    }
    const resolved = await resolveOnce(element, ctx);
    elements.push(resolved.some ? resolved.value : element);
  }
  return { type: "array", elements };
};

/**
 * 辞書値に含まれる間接参照を 1 段解決する utility を束ねた namespace。
 * ISO 32000-1:2008 § 7.3.10 準拠（辞書値・配列要素は間接参照でありうる）。
 */
export const ValueResolver = {
  /**
   * 値自体の間接参照のみを 1 段解決する（配列要素は解決しない）。
   * `/Kids` や `/Resources` のように、要素が参照のままである必要がある値に使う。
   *
   * @param value - 対象の値
   * @param ctx - 解決文脈
   * @returns 解決済みの値、失敗時は Option.none
   */
  async value(
    value: PdfValue,
    ctx: ResolveValueContext,
  ): Promise<Option<PdfValue>> {
    return resolveOnce(value, ctx);
  },

  /**
   * 値自体に加えて、配列だった場合は各要素も 1 段解決する。
   * `/MediaBox` `/CropBox` のように要素が数値である必要がある値に使う。
   *
   * @param value - 対象の値
   * @param ctx - 解決文脈
   * @returns 解決済みの値、失敗時は Option.none
   */
  async valueWithElements(
    value: PdfValue,
    ctx: ResolveValueContext,
  ): Promise<Option<PdfValue>> {
    const resolved = await resolveOnce(value, ctx);
    if (!resolved.some) {
      return none;
    }
    if (resolved.value.type !== "array") {
      return some(resolved.value);
    }
    return some(await resolveElements(resolved.value, ctx));
  },
} as const;
