import { none, type Option, some } from "../../utils/option/index";

/**
 * 組み込み型 `Uint8Array` 向けの汎用操作を集約した名前空間オブジェクト。
 */
export const Uint8ArrayEx = {
  /**
   * 指定位置でバイトパターンが一致するか判定する。
   *
   * @param data - 検索対象の Uint8Array
   * @param offset - 比較開始位置
   * @param pattern - 一致判定するバイト列
   * @returns 一致すれば true、範囲外または不一致なら false
   */
  matchesAt(
    data: Uint8Array,
    offset: number,
    pattern: readonly number[] | Uint8Array,
  ): boolean {
    if (offset < 0 || offset + pattern.length > data.length) {
      return false;
    }
    for (let i = 0; i < pattern.length; i++) {
      if (data[offset + i] !== pattern[i]) {
        return false;
      }
    }
    return true;
  },

  /**
   * `data` 内の [fromIndex, toIndex) の範囲で `pattern` が最初に出現するインデックスを返す。
   * 見つからない場合は none を返す。
   *
   * @param data - 検索対象の Uint8Array
   * @param pattern - 検索するバイト列
   * @param fromIndex - 検索開始インデックス（既定値: 0）
   * @param toIndex - 検索終了インデックスの上限（既定値: data.length）
   * @returns 最初に見つかったインデックスを保持する Option
   */
  indexOf(
    data: Uint8Array,
    pattern: readonly number[] | Uint8Array,
    fromIndex = 0,
    toIndex?: number,
  ): Option<number> {
    const end = Math.min(data.length, toIndex ?? data.length);
    const lastPossible = end - pattern.length;
    for (let i = Math.max(0, fromIndex); i <= lastPossible; i++) {
      if (Uint8ArrayEx.matchesAt(data, i, pattern)) {
        return some(i);
      }
    }
    return none;
  },
} as const;
