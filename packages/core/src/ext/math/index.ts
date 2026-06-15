/** 1 unit = 1000 thousandths（千分の一単位スケール）。 */
const THOUSAND = 1000;

/** 100 = 100%（百分率の基準値）。 */
const PERCENT = 100;

/** 数値変換ユーティリティ。単位変換・比率変換など、定数除算で表される頻出変換を提供する。 */
export const MathEx = {
  /**
   * 千分の一単位の数値を 1 単位スケールに変換する（`n / 1000`）。
   *
   * PDF text space は ISO 32000-1 §9.4.3 で「a number expressed in thousandths
   * of a unit of text space」と定義されており、TJ などの位置調整値はこの関数で
   * 単位スケールに戻してから text matrix 計算に渡す。
   *
   * @param n - 千分の一単位の数値
   * @returns 単位スケールに変換した数値
   */
  fromThousandths: (n: number): number => n / THOUSAND,

  /**
   * 百分率の数値を比率（0..1 系列）に変換する（`n / 100`）。
   *
   * PDF horizontal scaling (§9.3.4) など「100 = 等倍」の百分率パラメータを
   * 行列計算に渡す前に比率へ戻すのに用いる。
   *
   * @param n - 百分率の数値（100 = 100%）
   * @returns 比率に変換した数値
   */
  fromPercent: (n: number): number => n / PERCENT,
} as const;
