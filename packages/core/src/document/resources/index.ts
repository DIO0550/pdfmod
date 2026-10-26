import type { PdfError } from "../../pdf/errors/index";
import type {
  PdfDictionary,
  PdfObject,
  PdfValue,
  ResolveRef,
} from "../../pdf/types/index";
import { IndirectRef } from "../../pdf/types/index";
import { none, type Option, some } from "../../utils/option/index";
import { ok, type Result } from "../../utils/result/index";

/**
 * ISO 32000-1 Table 33 で定義されている標準リソースカテゴリ名の配列。
 */
export const PDF_RESOURCE_CATEGORIES = [
  "ExtGState",
  "ColorSpace",
  "Pattern",
  "Shading",
  "XObject",
  "Font",
  "Properties",
] as const;

/**
 * 標準リソースカテゴリ名のユニオン型。
 */
export type PdfResourceCategory = (typeof PDF_RESOURCE_CATEGORIES)[number];

/**
 * PDF の `/Resources` 辞書を型安全に表現するインターフェース。
 */
export interface PdfResources {
  readonly dictionary: PdfDictionary;
}

/**
 * 間接参照を解決し、ストリームまたは辞書などの実体オブジェクトを取得する内部ヘルパー。
 *
 * @param value - 対象の PdfValue
 * @param resolveRef - 間接参照解決コールバック
 * @returns 解決された PdfObject、無効な参照の場合は Option.none、エラー時は PdfError
 */
async function resolveObject(
  value: PdfValue,
  resolveRef: ResolveRef,
): Promise<Result<Option<PdfObject>, PdfError>> {
  if (value.type !== "indirect-ref") {
    return ok(some(value));
  }
  const refOpt = IndirectRef.from(value);
  if (!refOpt.some) {
    return ok(none);
  }
  const resolvedResult = await resolveRef(refOpt.value);
  if (!resolvedResult.ok) {
    return resolvedResult;
  }
  return ok(some(resolvedResult.value));
}

/**
 * `PdfResources` のファクトリおよび操作関数を束ねたコンパニオンオブジェクト。
 */
export const PdfResources = {
  /**
   * PdfDictionary から PdfResources を生成する。
   *
   * @param dictionary - リソース辞書（省略時は空辞書）
   * @returns 構築された PdfResources
   */
  from(dictionary?: PdfDictionary): PdfResources {
    const dict = dictionary ?? {
      type: "dictionary" as const,
      entries: new Map<string, PdfValue>(),
    };
    return { dictionary: dict };
  },

  /**
   * 空の PdfResources を生成する。
   *
   * @returns 空の PdfResources
   */
  createEmpty(): PdfResources {
    return PdfResources.from();
  },

  /**
   * 指定されたカテゴリが存在するか判定する。
   * カテゴリが `/ProcSet` の場合は非推奨のため常に false を返す。
   *
   * @param resources - 対象の PdfResources
   * @param category - カテゴリ名（例: "Font", "XObject"）
   * @returns 有効なカテゴリが存在すれば true
   */
  hasCategory(resources: PdfResources, category: string): boolean {
    if (category === "ProcSet") {
      return false;
    }
    return resources.dictionary.entries.has(category);
  },

  /**
   * カテゴリ辞書を間接参照を含めて解決し、PdfDictionary として取得する。
   * カテゴリが `/ProcSet` の場合は非推奨のため無視し `None` を返す。
   *
   * @param resources - 対象の PdfResources
   * @param category - カテゴリ名
   * @param resolveRef - 間接参照解決コールバック
   * @returns 解決されたカテゴリ辞書、存在しない/無効な場合は Option.none、エラー時は PdfError
   */
  async getCategory(
    resources: PdfResources,
    category: string,
    resolveRef: ResolveRef,
  ): Promise<Result<Option<PdfDictionary>, PdfError>> {
    if (category === "ProcSet") {
      return ok(none);
    }
    const catValue = resources.dictionary.entries.get(category);
    if (!catValue) {
      return ok(none);
    }
    const resolvedResult = await resolveObject(catValue, resolveRef);
    if (!resolvedResult.ok) {
      return resolvedResult;
    }
    if (!resolvedResult.value.some) {
      return ok(none);
    }
    const resolvedObj = resolvedResult.value.value;
    if (resolvedObj.type !== "dictionary") {
      return ok(none);
    }
    return ok(some(resolvedObj));
  },

  /**
   * 指定されたカテゴリとローカルリソース名から、間接参照を解決して実体オブジェクトを取得する。
   *
   * @param resources - 対象の PdfResources
   * @param category - カテゴリ名（例: "Font", "XObject"）
   * @param name - ローカルリソース名（例: "F1", "Im1"）
   * @param resolveRef - 間接参照解決コールバック
   * @returns 解決された PdfObject（辞書またはストリーム等）、存在しない場合は Option.none、エラー時は PdfError
   */
  async lookup(
    resources: PdfResources,
    category: string,
    name: string,
    resolveRef: ResolveRef,
  ): Promise<Result<Option<PdfObject>, PdfError>> {
    const catResult = await PdfResources.getCategory(
      resources,
      category,
      resolveRef,
    );
    if (!catResult.ok) {
      return catResult;
    }
    if (!catResult.value.some) {
      return ok(none);
    }
    const catDict = catResult.value.value;
    const entryValue = catDict.entries.get(name);
    if (!entryValue) {
      return ok(none);
    }
    return resolveObject(entryValue, resolveRef);
  },
} as const;
