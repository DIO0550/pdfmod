import { err, ok } from "../../../../utils/result/index";
import {
  GraphicsState,
  GraphicsStateStack,
  RenderingIntent,
} from "../../../graphics-state/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { OperandExtractor } from "../../operand-extractor/index";

const OPERATOR_NAME = "ri";

/**
 * PDF §8.6.5.8 `ri` operator (rendering intent) のハンドラ。
 * operand stack 末尾の Name で current GraphicsState の `renderingIntent` を更新する。
 *
 * - operand stack が空なら `OPERATOR_OPERAND_MISSING` を返す
 * - 末尾が name 以外なら `OPERATOR_OPERAND_TYPE_MISMATCH` を返す
 * - 未知の name もそのまま `renderingIntent` に格納する
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const riHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const nameResult = OperandExtractor.popName(
    context.operandStack,
    OPERATOR_NAME,
  );
  if (!nameResult.ok) {
    return err(nameResult.error);
  }
  const intentName = nameResult.value;

  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const next = GraphicsState.update(current, {
    renderingIntent: RenderingIntent.create(intentName),
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
