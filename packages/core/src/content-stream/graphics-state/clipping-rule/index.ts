import type { Brand } from "../../../utils/brand/index";

declare const ClippingRuleBrand: unique symbol;

/**
 * ISO 32000-1:2008 §8.5.4 のクリッピングパス規則。
 * - nonzero  : `W` operator (nonzero winding number rule)
 * - even-odd : `W*` operator (even-odd rule)
 *
 * Brand の基底型を文字列リテラル union に絞り, categorical domain を型レベルで保持する。
 * 基底 union は外部に export せず、Brand 越しの `ClippingRule` のみを公開する。
 */
export type ClippingRule = Brand<
  "nonzero" | "even-odd",
  typeof ClippingRuleBrand
>;

export const ClippingRule = {
  /**
   * nonzero winding number 規則を返す (`W` operator)。
   * @returns Brand 付き ClippingRule 値
   */
  nonzero(): ClippingRule {
    return "nonzero" as ClippingRule;
  },

  /**
   * even-odd 規則を返す (`W*` operator)。
   * @returns Brand 付き ClippingRule 値
   */
  evenOdd(): ClippingRule {
    return "even-odd" as ClippingRule;
  },
} as const;
