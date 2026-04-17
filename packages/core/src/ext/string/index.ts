import type { Option } from "../../utils/option/index";
import { none, some } from "../../utils/option/index";
import { NumberEx } from "../number/index";

const DECIMAL_INTEGER = /^\+?[0-9]+$/;

/** 文字列バリデーション・変換ユーティリティ。 */
export const StringEx = {
  /**
   * 10進整数文字列を0以上の安全な整数に変換する。
   * 変換できない場合は none を返す。
   *
   * @param s - 変換対象の文字列
   * @returns 変換後の数値、または none
   */
  toSafeIntegerAtLeastZero: (s: string): Option<number> => {
    if (!DECIMAL_INTEGER.test(s)) {
      return none;
    }
    const n = Number(s);
    return NumberEx.isSafeIntegerAtLeastZero(n) ? some(n) : none;
  },
} as const;
