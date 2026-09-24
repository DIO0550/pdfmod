import type { PdfError } from "../../../../pdf/errors/index";
import type { PdfInteger } from "../../../../pdf/types/pdf-types/index";
import { err, ok } from "../../../../utils/result/index";
import {
  GraphicsState,
  GraphicsStateStack,
  LineJoin,
} from "../../../graphics-state/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { OperandExtractor } from "../../operand-extractor/index";

const OPERATOR_NAME = "j";

/**
 * PDF §8.4.4 `j` operator (line join style) のハンドラ。
 * operand stack 末尾の整数 (0=Miter / 1=Round / 2=Bevel) で
 * current GraphicsState の `lineJoin` を更新する。
 *
 * - operand stack が空なら `OPERATOR_OPERAND_MISSING` を返す
 * - 末尾が integer 以外 (real / name / boolean / array / dictionary / ...) なら
 *   `OPERATOR_OPERAND_TYPE_MISMATCH` を返す (PDF §8.4.4 は integer 指定のため real も弾く)
 * - 末尾 integer の値が 0/1/2 以外 (3 / -1 / MAX_SAFE_INTEGER 等) なら
 *   `OPERATOR_OPERAND_VALUE_OUT_OF_RANGE` を返す (`allowed = LineJoin.allowed`)
 * - エラー時も operand は pop された状態のまま err を返す
 *   (operand stack は in-place で 1 つ消費済み)
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const lineJoinHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => {
  const operandResult = OperandExtractor.popOperand(
    context.operandStack,
    OPERATOR_NAME,
    (obj): obj is PdfInteger => obj.type === "integer",
    "integer",
  );
  if (!operandResult.ok) {
    return err(operandResult.error);
  }

  const value = operandResult.value.value;
  if (!LineJoin.isValid(value)) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_VALUE_OUT_OF_RANGE",
      message: `Operator '${OPERATOR_NAME}' operand value ${value} is out of range, expected one of [${LineJoin.allowed.join(", ")}]`,
      operatorName: OPERATOR_NAME,
      allowed: LineJoin.allowed,
      actual: value,
    };
    return err(error);
  }

  const join = LineJoin.create(value);
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const next = GraphicsState.update(current, { lineJoin: join });
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
