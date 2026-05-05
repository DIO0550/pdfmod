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
} as const;
