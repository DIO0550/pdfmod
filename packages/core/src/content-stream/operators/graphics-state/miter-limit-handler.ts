import type { PdfError } from "../../../pdf/errors/index";
import { err, ok } from "../../../utils/result/index";
import { GraphicsState, GraphicsStateStack } from "../../graphics-state/index";
import { OperandStack } from "../../operand-stack/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../operator-registry/index";

const OPERATOR_NAME = "M";

/**
 * PDF §8.4.4 `M` operator (miter limit) のハンドラ。
 * operand stack 末尾の数値で current GraphicsState の `miterLimit` を更新する。
 *
 * - operand stack が空なら `OPERATOR_OPERAND_MISSING` を返す
 * - 末尾が integer / real 以外なら `OPERATOR_OPERAND_TYPE_MISMATCH` を返す
 * - 数値の境界値 (`0` / 負値 / `NaN` / `Infinity`) はそのまま `miterLimit` に格納する
 *   (PDF §8.4.3.5 の `>0` 制約は本 handler のスコープ外、別 issue で validator 化)
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const miterLimitHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => {
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
  if (operand.type !== "integer" && operand.type !== "real") {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      message: `Operator '${OPERATOR_NAME}' expected number operand, got ${operand.type}`,
      operatorName: OPERATOR_NAME,
      expected: "number",
      actual: operand.type,
    };
    return err(error);
  }

  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const next = GraphicsState.update(current, { miterLimit: operand.value });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    context.graphicsStateStack,
    next,
  );

  return ok({
    operandStack: context.operandStack,
    graphicsStateStack,
  });
};
