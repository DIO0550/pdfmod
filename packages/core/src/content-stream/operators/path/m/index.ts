import type { PdfError } from "../../../../pdf/errors/index";
import { err, ok } from "../../../../utils/result/index";
import {
  CurrentPath,
  GraphicsState,
  GraphicsStateStack,
} from "../../../graphics-state/index";
import { PathSegment } from "../../../graphics-state/path-segment";
import { OperandStack } from "../../../operand-stack/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { NumericPdfObject } from "../../graphics-state/numeric-pdf-object";

const OPERATOR_NAME = "m";
const OPERAND_COUNT = 2;

/**
 * PDF §8.5.2 `m` operator (moveto) のハンドラ。
 *
 * operand stack から `x y` の 2 個の数値を pop し、
 * `PathSegment.moveTo(x, y)` を現在 GraphicsState の currentPath に append した
 * 新しい GraphicsState を生成する (ISO 32000-1:2008 §8.5.2)。
 *
 * - operand 不足 (< 2) のとき `OPERATOR_OPERAND_MISSING` を返す
 *   `actual` には pop に成功した個数 (0 または 1) を入れる
 * - operand に integer / real 以外が混在したとき `OPERATOR_OPERAND_TYPE_MISMATCH` を返す
 * - 値域 (`NaN` / `Infinity` / 負値 / 0) は本 handler では検証せずそのまま格納する
 * - エラー時に operand stack の部分消費は復元しない (既存 cm handler 規約)
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const mHandler: OperatorHandler = (context: OperatorHandlerContext) => {
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

  // popped は LIFO 順 [y, x]。reverse して PDF 順 [x, y] に戻す
  const [x, y] = popped
    .slice()
    .reverse()
    .map((operand) => operand.value);

  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const nextPath = CurrentPath.append(
    current.currentPath,
    PathSegment.moveTo(x, y),
  );
  const next = GraphicsState.update(current, { currentPath: nextPath });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    context.graphicsStateStack,
    next,
  );

  return ok({
    operandStack: context.operandStack,
    graphicsStateStack,
  });
};
