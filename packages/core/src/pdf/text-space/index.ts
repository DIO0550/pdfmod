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
   * PDF の「thousandths of a unit of text space」エンコーディングを
   * text space unit（≒ em 比）に変換する（`n / 1000`）。
   *
   * 用途: TJ 配列の位置調整値、/Widths のグリフ幅、`Type1` / `Type3` フォントの
   * グリフ座標など。text matrix へ反映する前に本関数で 1 em 単位に戻す。
   *
   * @param n - thousandths-of-em で表された数値
   * @returns text space unit に変換した値（1.0 = 1 em）
   */
  fromThousandths: (n: number): number => n / UNITS_PER_EM,
} as const;
