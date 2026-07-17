import type { Brand } from "../../../utils/brand/index";

declare const LineJoinBrand: unique symbol;

/**
 * ISO 32000-1:2008 §8.4.3.4 の line join style。
 * 0 = Miter (尖った接合)
 * 1 = Round (丸い接合)
 * 2 = Bevel (面取り接合)
 *
 * Brand の基底型を 0|1|2 リテラル union に絞り categorical domain を型レベルで保持する。
 */
export type LineJoin = Brand<0 | 1 | 2, typeof LineJoinBrand>;

export const LineJoin = {
  /**
   * ISO 32000-1:2008 §8.4.3.4 が定める line join の許容値 (0=Miter / 1=Round / 2=Bevel)。
   * `readonly [0, 1, 2]` のリテラル tuple 型を保持しつつ
   * `readonly number[]` への代入互換性を `satisfies` で静的検査する。
   * categorical operand を扱う `PdfError` の `allowed: readonly number[]` に直接渡せる。
   */
  allowed: [0, 1, 2] as const satisfies readonly number[],

  /**
   * 任意の number が line join の許容値 (0|1|2) かを判定する型ガード。
   * `true` を返した先で `n` は `0 | 1 | 2` に narrow される。
   *
   * @param n - 検査対象の数値
   * @returns n が 0/1/2 のいずれかなら true
   */
  isValid(n: number): n is 0 | 1 | 2 {
    return n === 0 || n === 1 || n === 2;
  },

  /**
   * 0 | 1 | 2 のいずれかを LineJoin として返す。
   *
   * @param n - line join style (0=Miter / 1=Round / 2=Bevel)
   * @returns Brand 付き LineJoin
   */
  create(n: 0 | 1 | 2): LineJoin {
    return n as LineJoin;
  },
} as const;
