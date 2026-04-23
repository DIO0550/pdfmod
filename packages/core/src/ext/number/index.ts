/** 数値バリデーションユーティリティ。 */
export const NumberEx = {
  /**
   * 正の安全な整数かどうかを判定する。
   *
   * @param n - 判定対象の数値
   * @returns n が正の安全な整数であれば true
   */
  isPositiveSafeInteger: (n: number): boolean =>
    Number.isSafeInteger(n) && n > 0,

  /**
   * 0以上の安全な整数かどうかを判定する。
   *
   * @param n - 判定対象の数値
   * @returns n が0以上の安全な整数であれば true
   */
  isSafeIntegerAtLeastZero: (n: number): boolean =>
    Number.isSafeInteger(n) && n >= 0,

  /**
   * 正の有限数（NaN / ±Infinity / 0 / 負数を除く）かどうかを判定する。
   *
   * @param n - 判定対象の数値
   * @returns n が正の有限数であれば true
   */
  isPositiveFinite: (n: number): boolean => Number.isFinite(n) && n > 0,
} as const;
