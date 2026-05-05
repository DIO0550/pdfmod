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
   * 0 | 1 | 2 のいずれかを LineCap として返す。
   *
   * @param n - line cap style (0=Butt / 1=Round / 2=Projecting Square)
   * @returns Brand 付き LineCap
   */
  create(n: 0 | 1 | 2): LineCap {
    return n as LineCap;
  },
} as const;
