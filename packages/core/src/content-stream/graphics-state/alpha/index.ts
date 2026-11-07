import type { Brand } from "../../../utils/brand/index";
import { none, type Option, some } from "../../../utils/option/index";

declare const AlphaBrand: unique symbol;

/** 0〜1 の有限な不透明度。 */
export type Alpha = Brand<number, typeof AlphaBrand>;

export const Alpha = {
  /**
   * 不透明度を検証して生成する。
   * @param value - 0 が透明、1 が不透明となる数値
   * @returns 範囲外・非有限値なら None
   */
  create(value: number): Option<Alpha> {
    const valid = Number.isFinite(value) && value >= 0 && value <= 1;
    return valid ? some(value as Alpha) : none;
  },
  /** @returns 完全に不透明な値 */
  opaque(): Alpha {
    return 1 as Alpha;
  },
} as const;
