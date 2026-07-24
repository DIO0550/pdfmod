import { ok } from "../../../../utils/result/index";
import { GraphicsStateStack } from "../../../graphics-state/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";

/**
 * PDF §8.4.4 `Q` operator (restore graphics state) のハンドラ。
 *
 * saved スタックから直前の GraphicsState を pop して current に復帰する。
 * operand は取らない。常に ok を返す。
 *
 * saved が空の場合（unbalanced restore）は `GraphicsStateStack.restore` が
 * current 維持の新 stack を返すため、handler も no-op 相当で ok を返す。
 * `RestoreResult.warning` は現時点では handler レベルで伝搬しない。
 * 将来、interpreter の warnings 配列に追加する拡張が検討される可能性がある。
 *
 * @param context - 実行コンテキスト
 * @returns 更新後コンテキスト (常に ok)
 */
export const qRestoreHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => {
  const restoreResult = GraphicsStateStack.restore(context.graphicsStateStack);

  return ok({
    operandStack: context.operandStack,
    graphicsStateStack: restoreResult.stack,
    markedContentStack: context.markedContentStack,
  });
};
