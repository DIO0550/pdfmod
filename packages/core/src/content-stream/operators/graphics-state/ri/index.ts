import type { PdfError } from "../../../../pdf/errors/index";
import { PdfName } from "../../../../pdf/types/pdf-types/index";
import { err, ok } from "../../../../utils/result/index";
import {
  GraphicsState,
  GraphicsStateStack,
  RenderingIntent,
} from "../../../graphics-state/index";
import { OperandStack } from "../../../operand-stack/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";

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
  const popped = OperandStack.pop(context.operandStack);
  if (!popped.some) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_MISSING",
      message: `Operator '${OPERATOR_NAME}' requires 1 operand(s), got 0`,
      operatorName: OPERATOR_NAME,
      required: 1,
      actual: 0,
    };
    return err(error);
  }

  const operand = popped.value;
  if (!PdfName.is(operand)) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      message: `Operator '${OPERATOR_NAME}' expected name operand, got ${operand.type}`,
      operatorName: OPERATOR_NAME,
      expected: "name",
      actual: operand.type,
    };
    return err(error);
  }

  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const next = GraphicsState.update(current, {
    renderingIntent: RenderingIntent.create(operand.value),
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
