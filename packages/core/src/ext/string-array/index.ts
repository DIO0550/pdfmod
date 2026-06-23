import type { Option } from "../../utils/option/index";
import { none, some } from "../../utils/option/index";

/** ReadonlyArray<string> に対する集合演算ユーティリティ。 */
export const StringArrayEx = {
  /**
   * 必須キー列を順に走査し、入力に存在しない最初のキーを返す。
   * 全て存在すれば none を返す。
   *
   * @param keys - 検査対象のキー名集合（重複可、順序は意味を持たない）
   * @param requiredKeys - 必須キー名の列（走査順に意味あり）
   * @returns 欠落キーがあれば some(欠落キー名)、全て揃っていれば none
   */
  firstMissing: (
    keys: ReadonlyArray<string>,
    requiredKeys: ReadonlyArray<string>,
  ): Option<string> => {
    for (const key of requiredKeys) {
      if (!keys.includes(key)) {
        return some(key);
      }
    }
    return none;
  },

  /**
   * 必須キー列が全て入力に含まれているかを判定する。
   * requiredKeys が空配列なら true を返す（vacuous truth）。
   *
   * @param keys - 検査対象のキー名集合
   * @param requiredKeys - 必須キー名の列
   * @returns 全て含まれていれば true、1 つでも欠落していれば false
   */
  containsAll: (
    keys: ReadonlyArray<string>,
    requiredKeys: ReadonlyArray<string>,
  ): boolean => {
    for (const key of requiredKeys) {
      if (!keys.includes(key)) {
        return false;
      }
    }
    return true;
  },

  /**
   * 必須キー列のうち、入力に存在しないキーを全て返す。
   * 順序は requiredKeys の出現順。requiredKeys 側に重複があっても結果に重複は出さない。
   *
   * @param keys - 検査対象のキー名集合
   * @param requiredKeys - 必須キー名の列
   * @returns 欠落キー名の配列（全て揃っていれば空配列）
   */
  allMissing: (
    keys: ReadonlyArray<string>,
    requiredKeys: ReadonlyArray<string>,
  ): ReadonlyArray<string> => {
    const missing: string[] = [];
    for (const key of requiredKeys) {
      if (!keys.includes(key) && !missing.includes(key)) {
        missing.push(key);
      }
    }
    return missing;
  },
} as const;
