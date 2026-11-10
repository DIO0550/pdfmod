import type { PdfError } from "../../../pdf/errors/index";
import {
  type PdfDictionary,
  PdfObject,
  ResolveRef,
} from "../../../pdf/types/index";
import { none, type Option, some } from "../../../utils/option/index";
import { ok, type Result } from "../../../utils/result/index";

export const CoordinateCounts = { Rectangle: 4, Matrix: 6 } as const;

type Coordinates = {
  readonly [CoordinateCounts.Rectangle]: readonly [
    number,
    number,
    number,
    number,
  ];
  readonly [CoordinateCounts.Matrix]: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
};

/** リソース辞書の直下の属性と、数値配列の要素を解決する。 */
export const ResourceParameters = {
  /**
   * 指定した属性だけを解決し、辞書・ストリームの内部へは再帰しない。
   * @param dictionary - 属性を持つ辞書
   * @param keys - 解決するキー
   * @param resolveRef - 同じ文書の参照解決関数
   * @returns 存在する属性の対応表。参照解決の失敗は元の Err
   */
  async resolve(
    dictionary: PdfDictionary,
    keys: readonly string[],
    resolveRef: ResolveRef,
  ): Promise<Result<ReadonlyMap<string, PdfObject>, PdfError>> {
    const fields = new Map<string, PdfObject>();
    for (const key of keys) {
      const result = await ResolveRef.object(
        dictionary.entries.get(key),
        resolveRef,
      );
      if (!result.ok) {
        return result;
      }

      if (result.value.some) {
        fields.set(key, result.value.value);
      }
    }

    return ok(fields);
  },

  /**
   * 配列の各要素を有限な数値へ変換する。
   * @param value - 解決済みの配列候補
   * @param resolveRef - 配列要素の参照解決関数
   * @returns 配列以外・数値以外は None、参照エラーは Err
   */
  async numbers(
    value: PdfObject | undefined,
    resolveRef: ResolveRef,
  ): Promise<Result<Option<readonly number[]>, PdfError>> {
    if (value?.type !== "array") {
      return ok(none);
    }

    const numbers: number[] = [];
    for (const element of value.elements) {
      const result = await ResolveRef.object(element, resolveRef);
      if (!result.ok) {
        return result;
      }

      const number = result.value.some
        ? PdfObject.asFiniteNumber(result.value.value)
        : none;
      if (!number.some) {
        return ok(none);
      }

      numbers.push(number.value);
    }

    return ok(some(numbers));
  },

  /**
   * 矩形の4座標または行列の6要素へ絞り込む。
   * @typeParam Size - 必要な要素数
   * @param value - 解決済みの配列候補
   * @param size - 必要な要素数
   * @param resolveRef - 配列要素の参照解決関数
   * @returns 個数・型が不正なら None、参照エラーは Err
   */
  async coordinates<Size extends keyof Coordinates>(
    value: PdfObject | undefined,
    size: Size,
    resolveRef: ResolveRef,
  ): Promise<Result<Option<Coordinates[Size]>, PdfError>> {
    const result = await ResourceParameters.numbers(value, resolveRef);
    if (!result.ok) {
      return result;
    }

    const valid = result.value.some && result.value.value.length === size;
    return ok(valid ? some(result.value.value as Coordinates[Size]) : none);
  },
} as const;
