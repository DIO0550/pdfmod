import { PdfResources } from "../../document/resources/index";
import type { PdfError } from "../../pdf/errors/index";
import type { PdfWarning } from "../../pdf/errors/warning/index";
import type { PdfDictionary, ResolveRef } from "../../pdf/types/index";
import { none, type Option, some } from "../../utils/option/index";
import { ok, type Result } from "../../utils/result/index";
import type { GraphicsState } from "../graphics-state/graphics-state/index";
import { ExtGStateParameter } from "./parameter/index";

export type { ExtGStateParameter } from "./parameter/index";

/** 解決済みの拡張状態辞書。省略されたキーは現在の状態を変更しない。 */
export type ExtGState = {
  readonly parameters: readonly ExtGStateParameter[];
  readonly warnings: readonly PdfWarning[];
};

export const ExtGState = {
  /**
   * 拡張状態辞書を読む。不正・未対応のエントリだけを警告して読み飛ばす。
   * @param dictionary - /ExtGState の名前から取得した辞書
   * @param resolveRef - 同じ文書の参照解決関数
   * @returns 解決済みパラメータと警告。参照解決の失敗は Err
   */
  async fromDictionary(
    dictionary: PdfDictionary,
    resolveRef: ResolveRef,
  ): Promise<Result<ExtGState, PdfError>> {
    const parameters: ExtGStateParameter[] = [];
    const warnings: PdfWarning[] = [];

    for (const [key, value] of dictionary.entries) {
      if (key === "Type") {
        continue;
      }

      if (!ExtGStateParameter.isSupported(key)) {
        warnings.push({
          code: "EXT_GSTATE_UNSUPPORTED_ENTRY",
          message: `Unsupported ExtGState entry: /${key}`,
        });
        continue;
      }

      const parsed = await ExtGStateParameter.read({ key, value }, resolveRef);
      if (!parsed.ok) {
        return parsed;
      }

      if (!parsed.value.some) {
        warnings.push({
          code: "EXT_GSTATE_INVALID_ENTRY",
          message: `Invalid ExtGState entry: /${key}`,
        });
        continue;
      }

      parameters.push(parsed.value.value);
    }

    return ok({ parameters, warnings });
  },

  /**
   * 拡張状態に含まれるパラメータだけを適用する。
   * @param state - 更新前のグラフィックス状態
   * @param extended - 解決済みの拡張状態
   * @returns 省略されたパラメータを保持した新しい状態
   */
  apply(state: GraphicsState, extended: ExtGState): GraphicsState {
    return extended.parameters.reduce(ExtGStateParameter.apply, state);
  },
} as const;

/** 現在のリソーススコープに属する拡張状態の解決結果。エラーも名前ごとに保持する。 */
export type ExtGStateResources = {
  readonly states: ReadonlyMap<string, Result<Option<ExtGState>, PdfError>>;
};

export const ExtGStateResources = {
  /** @returns 拡張状態のないリソーススコープ */
  empty(): ExtGStateResources {
    return { states: new Map() };
  },

  /**
   * 同期実行の前に /ExtGState サブ辞書を解決する。
   * @param resources - 現在のページ・フォームのリソーススコープ
   * @param resolveRef - 同じ文書の参照解決関数
   * @returns カテゴリの解決失敗は Err。各名前の失敗はその gs を実行するときに返す
   */
  async fromResources(
    resources: PdfResources,
    resolveRef: ResolveRef,
  ): Promise<Result<ExtGStateResources, PdfError>> {
    const category = await PdfResources.getCategory(
      resources,
      "ExtGState",
      resolveRef,
    );
    if (!category.ok) {
      return category;
    }

    if (!category.value.some) {
      return ok(ExtGStateResources.empty());
    }

    const states = new Map<string, Result<Option<ExtGState>, PdfError>>();
    for (const name of category.value.value.entries.keys()) {
      const result = await PdfResources.getExtGState(
        resources,
        name,
        resolveRef,
      );
      states.set(name, await ExtGStateResources.parse(result, resolveRef));
    }

    return ok({ states });
  },

  /**
   * 取得結果の不在・エラーを維持したまま辞書を解釈する。
   * @param result - 名前の解決結果
   * @param resolveRef - 同じ文書の参照解決関数
   * @returns 辞書内のパラメータを解決した結果
   */
  async parse(
    result: Result<Option<PdfDictionary>, PdfError>,
    resolveRef: ResolveRef,
  ): Promise<Result<Option<ExtGState>, PdfError>> {
    if (!result.ok) {
      return result;
    }

    if (!result.value.some) {
      return ok(none);
    }

    const parsed = await ExtGState.fromDictionary(
      result.value.value,
      resolveRef,
    );
    if (!parsed.ok) {
      return parsed;
    }

    return ok(some(parsed.value));
  },
} as const;
