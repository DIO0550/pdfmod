import { PdfResources } from "../../document/resources/index";
import { PdfPattern } from "../../document/resources/pattern/index";
import { PdfShading } from "../../document/resources/shading/index";
import type { PdfError } from "../../pdf/errors/index";
import type { PdfObject, ResolveRef } from "../../pdf/types/index";
import { type Option, some } from "../../utils/option/index";
import { map, ok, type Result } from "../../utils/result/index";

/** 同期の色指定・描画命令から参照する、現在のスコープのパターンとシェーディング。 */
export type PaintResources = {
  readonly patterns: ReadonlyMap<string, Result<Option<PdfPattern>, PdfError>>;
  readonly shadings: ReadonlyMap<string, Result<Option<PdfShading>, PdfError>>;
};

export const PaintResources = {
  /** @returns 描画リソースのないスコープ */
  empty(): PaintResources {
    return { patterns: new Map(), shadings: new Map() };
  },

  /**
   * 同期実行前に /Pattern と /Shading の定義を解決する。
   * @param resources - 現在のページ・フォームのリソーススコープ
   * @param resolveRef - 同じ文書の参照解決関数
   * @returns カテゴリの参照エラーは Err、個別定義のエラーは使用時まで保持する
   */
  async fromResources(
    resources: PdfResources,
    resolveRef: ResolveRef,
  ): Promise<Result<PaintResources, PdfError>> {
    const patterns = await PaintResources.readCategory(
      resources,
      { name: "Pattern", read: PdfPattern.fromObject },
      resolveRef,
    );
    if (!patterns.ok) {
      return patterns;
    }

    const shadings = await PaintResources.readCategory(
      resources,
      { name: "Shading", read: PdfShading.fromObject },
      resolveRef,
    );
    if (!shadings.ok) {
      return shadings;
    }

    return ok({ patterns: patterns.value, shadings: shadings.value });
  },

  /**
   * カテゴリの名前と解決結果を対応付ける。
   * @typeParam T - カテゴリ固有のパターンまたはシェーディング
   * @param resources - 現在のリソーススコープ
   * @param category - カテゴリ名と定義の読み取り関数
   * @param resolveRef - 同じ文書の参照解決関数
   * @returns 名前ごとの結果。不正な参照番号は None、参照エラーは保持する
   */
  async readCategory<T extends PdfPattern | PdfShading>(
    resources: PdfResources,
    category: {
      readonly name: "Pattern" | "Shading";
      readonly read: (
        object: PdfObject,
        resolveRef: ResolveRef,
      ) => Promise<Result<T, PdfError>>;
    },
    resolveRef: ResolveRef,
  ): Promise<
    Result<ReadonlyMap<string, Result<Option<T>, PdfError>>, PdfError>
  > {
    return PdfResources.readCategory(
      resources,
      {
        name: category.name,
        read: async (object, resolve) =>
          map(await category.read(object, resolve), some),
      },
      resolveRef,
    );
  },
} as const;
