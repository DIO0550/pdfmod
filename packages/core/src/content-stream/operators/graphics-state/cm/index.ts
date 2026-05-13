import type { PdfError } from "../../../../pdf/errors/index";
import { err, ok } from "../../../../utils/result/index";
import {
  GraphicsState,
  GraphicsStateStack,
  Matrix,
} from "../../../graphics-state/index";
import { OperandStack } from "../../../operand-stack/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { NumericPdfObject } from "../numeric-pdf-object";

const OPERATOR_NAME = "cm";
const OPERAND_COUNT = 6;

/**
 * PDF §8.4.4 `cm` operator (Concatenate Matrix to CTM) のハンドラ。
 *
 * operand stack から `a b c d e f` の 6 個の数値を pop し、
 * `Matrix.create(a, b, c, d, e, f)` を operand matrix として、
 * 新 CTM = operand matrix × 現在 CTM (ISO 32000-1:2008 §8.3.4 / §8.4.4) を算出する。
 *
 * - operand 不足 (< 6) のとき `OPERATOR_OPERAND_MISSING` を返す
 *   `actual` には pop に成功した個数を入れる
 * - operand に integer / real 以外が混在したとき `OPERATOR_OPERAND_TYPE_MISMATCH` を返す
 * - 値域 (`NaN` / `Infinity` / 負値) は本 handler では検証せずそのまま格納する
 * - エラー時に operand stack の部分消費は復元しない（既存ハンドラ規約）
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const cmHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const popped: NumericPdfObject[] = [];
  for (let i = 0; i < OPERAND_COUNT; i++) {
    const result = OperandStack.pop(context.operandStack);
    if (!result.some) {
      const error: PdfError = {
        code: "OPERATOR_OPERAND_MISSING",
        message: `Operator '${OPERATOR_NAME}' requires ${OPERAND_COUNT} operand(s), got ${i}`,
        operatorName: OPERATOR_NAME,
        required: OPERAND_COUNT,
        actual: i,
      };
      return err(error);
    }
    const operand = result.value;
    if (!NumericPdfObject.is(operand)) {
      const error: PdfError = {
        code: "OPERATOR_OPERAND_TYPE_MISMATCH",
        message: `Operator '${OPERATOR_NAME}' expected number operand, got ${operand.type}`,
        operatorName: OPERATOR_NAME,
        expected: "number",
        actual: operand.type,
      };
      return err(error);
    }
    popped.push(operand);
  }

  // popped は LIFO 順で [f, e, d, c, b, a]。reverse して PDF 順 [a, b, c, d, e, f] に戻す
  const [a, b, c, d, e, f] = popped
    .slice()
    .reverse()
    .map((operand) => operand.value);

  const operandMatrix = Matrix.create(a, b, c, d, e, f);
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const nextCtm = Matrix.multiply(operandMatrix, current.ctm);
  const next = GraphicsState.update(current, { ctm: nextCtm });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    context.graphicsStateStack,
    next,
  );

  return ok({
    operandStack: context.operandStack,
    graphicsStateStack,
  });
};
