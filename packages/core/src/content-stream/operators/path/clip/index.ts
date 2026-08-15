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
 * PDF §8.5.4 `W` operator (set clipping path, nonzero winding number rule) の
 * ハンドラ。
 *
 * ISO 32000-1:2008 §8.5.4.1: `W` はクリッピングパスを即座には適用せず、
 * 直後の path-painting operator で確定する。本 handler は `pendingClip` に
 * 意図を記録するだけで current path には触れない。
 *
 * - operand 数: 0 (operand stack を一切参照しない)
 * - `pendingClip` が既に some の場合は後勝ちで上書きする (§8.5.4 では undefined。
 *   pdf.js と同じ振る舞いに揃える)。warning は出さない
 * - currentPath を含め pendingClip 以外の graphics state は変更しない
 * - 本 handler では PdfError を返さない (常に ok)
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns pendingClip を some("nonzero") にした新しいコンテキスト (常に ok)
 */
export const clipHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => {
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const next = GraphicsState.update(current, {
    pendingClip: some(ClippingRule.nonzero()),
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
