import { err, ok } from "../../../../utils/result/index";
import {
  GraphicsState,
  GraphicsStateStack,
} from "../../../graphics-state/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { OperandExtractor } from "../../operand-extractor/index";

const OPERATOR_NAME = "i";

/**
 * PDF §10.6.2 `i` operator (flatness tolerance) のハンドラ。
 * operand stack 末尾の数値で current GraphicsState の `flatness` を更新する。
 *
 * - operand stack が空なら `OPERATOR_OPERAND_MISSING` を返す
 * - 末尾が integer / real 以外なら `OPERATOR_OPERAND_TYPE_MISMATCH` を返す
 * - 範囲外の数値 (負値 / 100 超過等) は handler では弾かない
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const flatnessHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => {
  const operandResult = OperandExtractor.popNumber(
    context.operandStack,
    OPERATOR_NAME,
  );
  if (!operandResult.ok) {
    return err(operandResult.error);
  }
  const flatness = operandResult.value;

  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const next = GraphicsState.update(current, { flatness });
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
