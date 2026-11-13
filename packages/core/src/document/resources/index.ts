import type { PdfError } from "../../pdf/errors/index";
import type { PdfDictionary, PdfObject, PdfValue } from "../../pdf/types/index";
import { ResolveRef } from "../../pdf/types/index";
import { none, type Option, some } from "../../utils/option/index";
import { ok, type Result } from "../../utils/result/index";
import { PdfXObject } from "./xobject/index";

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
   * `/Font` のローカル名からフォント辞書を解決する（docs/specs/04 §3.1）。
   * 辞書内部のフォント種別・エンコーディングは解釈しない。
   *
   * @param resources - ページ等の現在のスコープのリソース辞書
   * @param name - Tf が指定した、先頭のスラッシュを含まない名前
   * @param resolveRef - 同じ文書の間接参照解決関数
   * @returns 辞書なら Some、不在・辞書以外なら None。参照解決の失敗は Err
   */
  async getFont(
    resources: PdfResources,
    name: string,
    resolveRef: ResolveRef,
  ): Promise<Result<Option<PdfDictionary>, PdfError>> {
    const result = await PdfResources.lookup(
      resources,
      "Font",
      name,
      resolveRef,
    );

    if (!result.ok) {
      return result;
    }

    if (!result.value.some) {
      return ok(none);
    }

    const font = result.value.value;

    if (font.type !== "dictionary") {
      return ok(none);
    }

    return ok(some(font));
  },

  /**
   * /ExtGState のローカル名から拡張状態辞書を取得する。
   * @param resources - 現在のリソーススコープ
   * @param name - gs の名前オペランド
   * @param resolveRef - 同じ文書の参照解決関数
   * @returns 不在・辞書以外なら None、参照解決の失敗なら Err
   */
  async getExtGState(
    resources: PdfResources,
    name: string,
    resolveRef: ResolveRef,
  ): Promise<Result<Option<PdfDictionary>, PdfError>> {
    const result = await PdfResources.lookup(
      resources,
      "ExtGState",
      name,
      resolveRef,
    );

    if (!result.ok) {
      return result;
    }

    const target = result.value;
    const dictionary = target.some && target.value.type === "dictionary";
    return ok(dictionary ? some(target.value) : none);
  },

  /**
   * Do のローカル名を現在の /XObject 辞書で解決し、ストリームの種別を読む。
   * @param resources - 現在のリソーススコープ
   * @param name - Do の名前オペランド（先頭のスラッシュを除く）
   * @param resolveRef - 同じ文書の間接参照解決関数
   * @returns 名前がない場合とストリーム以外は None、参照解決の失敗は Err
   */
  async getXObject(
    resources: PdfResources,
    name: string,
    resolveRef: ResolveRef,
  ): Promise<Result<Option<PdfXObject>, PdfError>> {
    const result = await PdfResources.lookup(
      resources,
      "XObject",
      name,
      resolveRef,
    );
    if (!result.ok) {
      return result;
    }

    const target = result.value;
    if (!target.some) {
      return ok(none);
    }

    return PdfXObject.fromObject(target.value, resolveRef);
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
    const resolvedResult = await ResolveRef.object(catValue, resolveRef);
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
   * カテゴリ辞書を一度引き、名前ごとの読み取り結果を保持する。
   * カテゴリ自体の参照エラーと、個別の参照・読み取りエラーを区別する。
   */
  async readCategory<T>(
    resources: PdfResources,
    category: {
      readonly name: PdfResourceCategory;
      readonly read: (
        object: PdfObject,
        resolveRef: ResolveRef,
      ) => Result<Option<T>, PdfError> | Promise<Result<Option<T>, PdfError>>;
    },
    resolveRef: ResolveRef,
  ): Promise<
    Result<ReadonlyMap<string, Result<Option<T>, PdfError>>, PdfError>
  > {
    const dictionary = await PdfResources.getCategory(
      resources,
      category.name,
      resolveRef,
    );
    if (!dictionary.ok) {
      return dictionary;
    }

    const entries = new Map<string, Result<Option<T>, PdfError>>();
    if (!dictionary.value.some) {
      return ok(entries);
    }

    for (const [name, value] of dictionary.value.value.entries) {
      const object = await ResolveRef.object(value, resolveRef);
      if (!object.ok || !object.value.some) {
        entries.set(name, object.ok ? ok(none) : object);
        continue;
      }

      entries.set(name, await category.read(object.value.value, resolveRef));
    }

    return ok(entries);
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
    return ResolveRef.object(entryValue, resolveRef);
  },
} as const;
