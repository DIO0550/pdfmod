import { ok } from "../../../../utils/result/index";
import { GraphicsStateStack } from "../../../graphics-state/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";

/**
 * PDF §8.4.4 `q` operator (save graphics state) のハンドラ。
 *
 * 現在の GraphicsState を saved スタックに push する。
 * operand は取らない。常に ok を返す。
 *
 * @param context - 実行コンテキスト
 * @returns 更新後コンテキスト (常に ok)
 */
export const qHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const graphicsStateStack = GraphicsStateStack.save(
    context.graphicsStateStack,
  );

  return ok({
    operandStack: context.operandStack,
    graphicsStateStack,
    markedContentStack: context.markedContentStack,
  });
};
