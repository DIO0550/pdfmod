/**
 * PDF text space (ISO 32000-1 §9.4.4) のスケール: 1 em は 1000 個の整数単位に
 * 分割される。Adobe Type1 / AFM 形式の慣習で、グリフ幅辞書（/Widths）や TJ
 * 配列内の数値はこの整数単位（§9.4.3 では "thousandths of a unit of text space"
 * と表記）でエンコードされる。整数で 3 桁精度のグリフ幅を表現できるようにする
 * ためのもの。
 */
const UNITS_PER_EM = 1000;

/** PDF text space 関連の単位変換ユーティリティ。 */
export const TextSpace = {
  /**
   * PDF text space グリッド上の数値（1 em = 1000 単位、ISO 32000-1 §9.4.3 では
   * "thousandths of a unit of text space" と表記）を em 比に変換する。
   *
   * 整数 / 実数の両方を受け付ける。TJ 配列の位置調整値は integer / real のいずれも
   * 取り得るほか、/Widths のグリフ幅、`Type1` / `Type3` フォントのグリフ座標などにも
   * 用いる。text matrix へ反映する前に本関数で em 単位に戻す。
   *
   * @param n - text space グリッド上の数値（1 em = 1000 単位、小数も可）
   * @returns em 比（1.0 = 1 em）
   */
  toEm: (n: number): number => n / UNITS_PER_EM,
} as const;
