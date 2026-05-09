import type { Brand } from "../../utils/brand/index";

declare const MatrixBrand: unique symbol;

/**
 * PDF の 6 要素変換行列 [a, b, c, d, e, f]。
 * 完全な 3x3 行列では以下を表し、固定の第3列 [0, 0, 1] が省略される。
 *   | a b 0 |
 *   | c d 0 |
 *   | e f 1 |
 */
export type Matrix = Brand<
  readonly [number, number, number, number, number, number],
  typeof MatrixBrand
>;

export const Matrix = {
  /**
   * 6 要素を保持する Matrix を生成する。
   *
   * @param a - 行列要素 a
   * @param b - 行列要素 b
   * @param c - 行列要素 c
   * @param d - 行列要素 d
   * @param e - 行列要素 e (平行移動 x)
   * @param f - 行列要素 f (平行移動 y)
   * @returns 6 要素を保持する Matrix
   */
  create(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): Matrix {
    return [a, b, c, d, e, f] as const as unknown as Matrix;
  },
  /**
   * 単位行列 [1, 0, 0, 1, 0, 0] を返す。
   * 呼び出し毎に新規 tuple を生成する (singleton 化しない)。
   *
   * @returns 単位行列を表す Matrix
   */
  identity(): Matrix {
    return [1, 0, 0, 1, 0, 0] as const as unknown as Matrix;
  },
  /**
   * 2 つの Matrix を乗算し、`left × right` を返す純粋関数。
   *
   * PDF の 6 要素行列を 3×3 形式
   *   | a b 0 |
   *   | c d 0 |
   *   | e f 1 |
   * とみなして掛け合わせ、結果の 6 要素を持つ新規 Matrix を返す。
   * 元の `left` / `right` は変更しない。
   *
   * cm operator では `multiply(operand, currentCTM)` の形で呼び出し、
   * 新CTM = 指定行列 × 現在のCTM (ISO 32000-1:2008 §8.3.4) を実現する。
   *
   * @param left - 乗算左辺
   * @param right - 乗算右辺
   * @returns `left × right` を表す新規 Matrix
   */
  multiply(left: Matrix, right: Matrix): Matrix {
    const [a1, b1, c1, d1, e1, f1] = left;
    const [a2, b2, c2, d2, e2, f2] = right;
    return [
      a1 * a2 + b1 * c2,
      a1 * b2 + b1 * d2,
      c1 * a2 + d1 * c2,
      c1 * b2 + d1 * d2,
      e1 * a2 + f1 * c2 + e2,
      e1 * b2 + f1 * d2 + f2,
    ] as const as unknown as Matrix;
  },
} as const;
