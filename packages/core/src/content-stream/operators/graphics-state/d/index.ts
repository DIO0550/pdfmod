import type { PdfError } from "../../../../pdf/errors/index";
import { err, ok } from "../../../../utils/result/index";
import {
  DashPattern,
  GraphicsState,
  GraphicsStateStack,
} from "../../../graphics-state/index";
import { OperandStack } from "../../../operand-stack/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { NumericPdfObject } from "../numeric-pdf-object";

const OPERATOR_NAME = "d";
const REQUIRED_OPERAND_COUNT = 2;

/**
 * PDF §8.4.3.6 `d` operator (dash pattern) のハンドラ。
 * operand stack 末尾の `dashArray dashPhase` で current GraphicsState の
 * `dashPattern` を更新する。
 *
 * - operand が 2 個未満なら `OPERATOR_OPERAND_MISSING` を返す
 * - dashPhase が integer / real 以外なら `OPERATOR_OPERAND_TYPE_MISMATCH` を返す
 * - dashArray が array 以外なら `OPERATOR_OPERAND_TYPE_MISMATCH` を返す
 * - dashArray の要素に integer / real 以外があれば、最初の 1 件だけを
 *   index 付き message の `OPERATOR_OPERAND_TYPE_MISMATCH` として返す
 * - 値の妥当性 (負値 / `NaN` / 奇数長 / 全要素 0) は検証せずそのまま格納する
 *   (§8.4.3.6 の制約は本 handler のスコープ外)
 *
 * 型不一致で失敗する場合も pop 済みの operand は stack へ戻さない。
 * 巻き戻しは content stream 全体の中断を前提とする上位層の責務であり、
 * handler が部分的に復元すると「どこまで消費されたか」が追えなくなるため。
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const dHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const poppedPhase = OperandStack.pop(context.operandStack);
  if (!poppedPhase.some) {
    return err(operandMissingError(0));
  }

  const poppedArray = OperandStack.pop(context.operandStack);
  if (!poppedArray.some) {
    return err(operandMissingError(1));
  }

  const phase = poppedPhase.value;
  if (!NumericPdfObject.is(phase)) {
    return err(
      typeMismatchError(
        "number",
        phase.type,
        `Operator '${OPERATOR_NAME}' expected number operand, got ${phase.type}`,
      ),
    );
  }

  const dashArray = poppedArray.value;
  if (dashArray.type !== "array") {
    return err(
      typeMismatchError(
        "array",
        dashArray.type,
        `Operator '${OPERATOR_NAME}' expected array operand, got ${dashArray.type}`,
      ),
    );
  }

  const dashLengths: number[] = [];
  for (const [index, element] of dashArray.elements.entries()) {
    if (!NumericPdfObject.is(element)) {
      return err(
        typeMismatchError(
          "number",
          element.type,
          `Operator '${OPERATOR_NAME}' expected number array element at index ${index}, got ${element.type}`,
        ),
      );
    }
    dashLengths.push(element.value);
  }

  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const next = GraphicsState.update(current, {
    dashPattern: DashPattern.create(dashLengths, phase.value),
  });

  return ok({
    operandStack: context.operandStack,
    graphicsStateStack: GraphicsStateStack.replaceCurrent(
      context.graphicsStateStack,
      next,
    ),
    markedContentStack: context.markedContentStack,
  });
};

/**
 * operand 不足エラーを組み立てる。
 *
 * @param actual - 実際に pop できた operand 数
 * @returns `OPERATOR_OPERAND_MISSING` の PdfError
 */
function operandMissingError(actual: number): PdfError {
  return {
    code: "OPERATOR_OPERAND_MISSING",
    message: `Operator '${OPERATOR_NAME}' requires ${REQUIRED_OPERAND_COUNT} operand(s), got ${actual}`,
    operatorName: OPERATOR_NAME,
    required: REQUIRED_OPERAND_COUNT,
    actual,
  };
}

/**
 * operand の型不一致エラーを組み立てる。
 *
 * @param expected - 期待した型の呼称
 * @param actual - 実際の PdfObject の type
 * @param message - 人間可読なエラーメッセージ
 * @returns `OPERATOR_OPERAND_TYPE_MISMATCH` の PdfError
 */
function typeMismatchError(
  expected: string,
  actual: string,
  message: string,
): PdfError {
  return {
    code: "OPERATOR_OPERAND_TYPE_MISMATCH",
    message,
    operatorName: OPERATOR_NAME,
    expected,
    actual,
  };
}
