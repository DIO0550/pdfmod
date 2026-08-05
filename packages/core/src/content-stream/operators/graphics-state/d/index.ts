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
import { NumericPdfObject } from "../numeric-pdf-object/index";

/** PDF 表記を保持した operator 名（"d"）。 */
const OPERATOR_NAME = "d";

/** `d` operator が要求する operand 数（dashArray dashPhase）。 */
const OPERAND_COUNT = 2;

/**
 * PDF §8.4.3.6 `d` operator (line dash pattern) のハンドラ。
 * operand stack から LIFO 順で dashPhase（数値）→ dashArray（配列）を pop し、
 * current GraphicsState の `dashPattern` を更新する。
 *
 * 検査順序:
 *   (1) phase pop（none なら `OPERATOR_OPERAND_MISSING`, got 0）
 *   (2) phase numeric 検査（`OPERATOR_OPERAND_TYPE_MISMATCH`, expected "number"）
 *   (3) dashArray pop（none なら `OPERATOR_OPERAND_MISSING`, got 1）
 *   (4) top-level 型検査（type !== "array" なら expected "array"）
 *   (5) 要素走査（numeric 以外なら expected "number"、message に index を含める）
 *
 * - 空配列 `[] 0 d` は solid line（`DashPattern.solid()` と構造的同値）になる
 * - 値域検証（負値 / 全ゼロ / NaN / Infinity）は本 handler のスコープ外
 *   （別 issue で validator 化。w / M handler と同方針）
 * - エラー時に operand stack の部分消費は復元しない（既存ハンドラ規約）
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const dHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const poppedPhase = OperandStack.pop(context.operandStack);
  if (!poppedPhase.some) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_MISSING",
      message: `Operator '${OPERATOR_NAME}' requires ${OPERAND_COUNT} operand(s), got 0`,
      operatorName: OPERATOR_NAME,
      required: OPERAND_COUNT,
      actual: 0,
    };
    return err(error);
  }

  const phase = poppedPhase.value;
  if (!NumericPdfObject.is(phase)) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      message: `Operator '${OPERATOR_NAME}' expected number operand, got ${phase.type}`,
      operatorName: OPERATOR_NAME,
      expected: "number",
      actual: phase.type,
    };
    return err(error);
  }

  const poppedArray = OperandStack.pop(context.operandStack);
  if (!poppedArray.some) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_MISSING",
      message: `Operator '${OPERATOR_NAME}' requires ${OPERAND_COUNT} operand(s), got 1`,
      operatorName: OPERATOR_NAME,
      required: OPERAND_COUNT,
      actual: 1,
    };
    return err(error);
  }

  const dashArray = poppedArray.value;
  if (dashArray.type !== "array") {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      message: `Operator '${OPERATOR_NAME}' expected array operand, got ${dashArray.type}`,
      operatorName: OPERATOR_NAME,
      expected: "array",
      actual: dashArray.type,
    };
    return err(error);
  }

  const numbers: number[] = [];
  for (let i = 0; i < dashArray.elements.length; i++) {
    const element = dashArray.elements[i];
    if (!NumericPdfObject.is(element)) {
      const error: PdfError = {
        code: "OPERATOR_OPERAND_TYPE_MISMATCH",
        message: `Operator '${OPERATOR_NAME}' expected number array element, got ${element.type} at index ${i}`,
        operatorName: OPERATOR_NAME,
        expected: "number",
        actual: element.type,
      };
      return err(error);
    }
    numbers.push(element.value);
  }

  const dashPattern = DashPattern.create(numbers, phase.value);
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const next = GraphicsState.update(current, { dashPattern });
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
