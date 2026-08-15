import { some } from "../../../../utils/option/index";
import { ok } from "../../../../utils/result/index";
import {
  ClippingRule,
  GraphicsState,
  GraphicsStateStack,
} from "../../../graphics-state/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";

/**
 * PDF §8.5.4 `W*` operator (set clipping path, even-odd rule) のハンドラ。
 *
 * `W` (clipHandler) との違いは記録する `ClippingRule` のみ。pending semantics・
 * 上書き規則・current path に触れない点はすべて `W` と同じ。
 *
 * `f*` が `f` へ委譲できたのに対し、`W*` は規則を state に書き込むため
 * 委譲では表現できず独立した実体を持つ。
 *
 * - operand 数: 0 (operand stack を一切参照しない)
 * - `pendingClip` が既に some の場合は後勝ちで上書きする。warning は出さない
 * - currentPath を含め pendingClip 以外の graphics state は変更しない
 * - 本 handler では PdfError を返さない (常に ok)
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns pendingClip を some("even-odd") にした新しいコンテキスト (常に ok)
 */
export const clipEvenOddHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => {
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const next = GraphicsState.update(current, {
    pendingClip: some(ClippingRule.evenOdd()),
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    context.graphicsStateStack,
    next,
  );
  return ok({
    operandStack: context.operandStack,
    graphicsStateStack,
    markedContentStack: context.markedContentStack,
  });
};
