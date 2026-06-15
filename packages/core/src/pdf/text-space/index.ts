/**
 * PDF text space (ISO 32000-1 §9.4.4) のスケール。
 *
 * グリフ幅辞書（/Widths）や TJ 配列内の数値は §9.4.3 で「thousandths of a unit
 * of text space」と定義されている。これは Adobe Type1 / AFM 形式の慣習で
 * 1 em = 1000 単位の整数エンコーディング（整数で 3 桁精度のグリフ幅を表現するため）。
 */
const THOUSANDTHS_PER_UNIT = 1000;

/** PDF text space 関連の単位変換ユーティリティ。 */
export const TextSpace = {
  /**
   * PDF の「thousandths of a unit of text space」エンコーディングを
   * text space unit（≒ em 比）に変換する（`n / 1000`）。
   *
   * 用途: TJ 配列の位置調整値、/Widths のグリフ幅、`Type1` / `Type3` フォントの
   * グリフ座標など。text matrix へ反映する前に本関数で 1 em 単位に戻す。
   *
   * @param thousandths - thousandths-of-em で表された数値
   * @returns text space unit に変換した値（1.0 = 1 em）
   */
  fromThousandths: (thousandths: number): number =>
    thousandths / THOUSANDTHS_PER_UNIT,
} as const;
