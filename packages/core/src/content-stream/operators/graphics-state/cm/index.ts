import { err, ok } from "../../../../utils/result/index";
import {
  GraphicsState,
  GraphicsStateStack,
  Matrix,
} from "../../../graphics-state/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { OperandExtractor } from "../../operand-extractor/index";

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
  const operandsResult = OperandExtractor.popNumbers(
    context.operandStack,
    OPERATOR_NAME,
    OPERAND_COUNT,
  );
  if (!operandsResult.ok) {
    return err(operandsResult.error);
  }
  const [a, b, c, d, e, f] = operandsResult.value;

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
    markedContentStack: context.markedContentStack,
  });
};
