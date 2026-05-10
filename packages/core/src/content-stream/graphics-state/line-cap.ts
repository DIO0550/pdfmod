import type { Brand } from "../../utils/brand/index";

declare const LineCapBrand: unique symbol;

/**
 * PDF 仕様 §4.1 の line cap style。
 * 0 = Butt (端をパスの終点で切る)
 * 1 = Round (端を半円形にする)
 * 2 = Projecting Square (端を半線幅分突き出す)
 *
 * Brand の基底型を 0|1|2 リテラル union に絞り categorical domain を型レベルで保持する。
 */
export type LineCap = Brand<0 | 1 | 2, typeof LineCapBrand>;

export const LineCap = {
  /**
   * PDF §4.1 が定める line cap の許容値 (0=Butt / 1=Round / 2=Projecting Square)。
   * `readonly [0, 1, 2]` のリテラル tuple 型を保持しつつ
   * `readonly number[]` への代入互換性を `satisfies` で静的検査する。
   * categorical operand を扱う `PdfError` の `allowed: readonly number[]` に直接渡せる。
   */
  allowed: [0, 1, 2] as const satisfies readonly number[],

  /**
   * 任意の number が line cap の許容値 (0|1|2) かを判定する型ガード。
   * `true` を返した先で `n` は `0 | 1 | 2` に narrow される。
   *
   * @param n - 検査対象の数値
   * @returns n が 0/1/2 のいずれかなら true
   */
  isValid(n: number): n is 0 | 1 | 2 {
    return n === 0 || n === 1 || n === 2;
  },

  /**
   * 0 | 1 | 2 のいずれかを LineCap として返す。
   *
   * @param n - line cap style (0=Butt / 1=Round / 2=Projecting Square)
   * @returns Brand 付き LineCap
   */
  create(n: 0 | 1 | 2): LineCap {
    return n as LineCap;
  },
} as const;
