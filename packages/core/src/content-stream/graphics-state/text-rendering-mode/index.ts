import type { Brand } from "../../../utils/brand/index";

declare const TextRenderingModeBrand: unique symbol;

type TextRenderingModeValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * PDF 仕様 §9.3.6 の text rendering mode。
 * 0 = Fill (グリフを塗りつぶす, デフォルト)
 * 1 = Stroke (グリフの輪郭線のみ描画)
 * 2 = Fill, then stroke (塗りつぶした上に輪郭線を描画)
 * 3 = Invisible (描画しない, 検索/選択用)
 * 4 = Fill, then add to path for clipping (塗りつぶし後、クリッピングパスへ追加)
 * 5 = Stroke, then add to path for clipping (輪郭線描画後、クリッピングパスへ追加)
 * 6 = Fill, then stroke, then add to path for clipping (塗+線後、クリッピングパスへ追加)
 * 7 = Add text to path for clipping (描画なしでクリッピングパスへ追加)
 *
 * Brand の基底型を 0|1|2|3|4|5|6|7 リテラル union に絞り categorical domain を型レベルで保持する。
 */
export type TextRenderingMode = Brand<
  TextRenderingModeValue,
  typeof TextRenderingModeBrand
>;

export const TextRenderingMode = {
  /**
   * PDF §9.3.6 が定める text rendering mode の許容値 (0=Fill 〜 7=Add to path for clipping)。
   * `readonly [0,1,2,3,4,5,6,7]` のリテラル tuple 型を保持しつつ
   * `readonly number[]` への代入互換性を `satisfies` で静的検査する。
   * categorical operand を扱う `PdfError` の `allowed: readonly number[]` に直接渡せる。
   */
  allowed: [0, 1, 2, 3, 4, 5, 6, 7] as const satisfies readonly number[],

  /**
   * 任意の number が text rendering mode の許容値 (0〜7 の整数) かを判定する型ガード。
   * `true` を返した先で `n` は `0 | 1 | 2 | 3 | 4 | 5 | 6 | 7` に narrow される。
   *
   * @param n - 検査対象の数値
   * @returns n が 0〜7 のいずれかの整数なら true
   */
  isValid(n: number): n is TextRenderingModeValue {
    return Number.isInteger(n) && n >= 0 && n <= 7;
  },

  /**
   * 0〜7 のいずれかを TextRenderingMode として返す。
   *
   * @param n - text rendering mode (0=Fill / 1=Stroke / 2=Fill+Stroke / 3=Invisible / 4=Fill+Clip / 5=Stroke+Clip / 6=Fill+Stroke+Clip / 7=Clip only)
   * @returns Brand 付き TextRenderingMode
   */
  create(n: TextRenderingModeValue): TextRenderingMode {
    return n as TextRenderingMode;
  },
} as const;
