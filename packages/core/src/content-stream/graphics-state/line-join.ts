import type { Brand } from "../../utils/brand/index";

declare const LineJoinBrand: unique symbol;

/**
 * PDF 仕様 §4.1 の line join style。
 * 0 = Miter (尖った接合)
 * 1 = Round (丸い接合)
 * 2 = Bevel (面取り接合)
 *
 * Brand の基底型を 0|1|2 リテラル union に絞り categorical domain を型レベルで保持する。
 */
export type LineJoin = Brand<0 | 1 | 2, typeof LineJoinBrand>;

export const LineJoin = {
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
