import type { PdfError } from "../../../../pdf/errors/index";
import { err, ok } from "../../../../utils/result/index";
import {
  CurrentPath,
  GraphicsState,
  GraphicsStateStack,
} from "../../../graphics-state/index";
import { PathSegment } from "../../../graphics-state/path-segment";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { OperandExtractor } from "../../operand-extractor/index";

const OPERATOR_NAME = "y";
const OPERAND_COUNT = 4;

/**
 * PDF §8.5.2.3 `y` operator (第 2 制御点 = 終点の 3 次 Bezier) のハンドラ。
 *
 * operand stack から `x1 y1 x3 y3` の 4 個の数値を pop し、
 * `PathSegment.curveTo(x1, y1, x3, y3, x3, y3)` を current path の末尾に append した
 * 新しい GraphicsState を生成する。
 *
 * current point の座標値は使わないが、§8.5.2.3 上 current point の確立は必須である。
 *
 * - operand 不足 (< 4) のとき `OPERATOR_OPERAND_MISSING` を返す
 * - operand に integer / real 以外が混在したとき `OPERATOR_OPERAND_TYPE_MISMATCH` を返す
 * - current point が未確立の場合 `OPERATOR_PATH_NO_CURRENT_POINT` を返す
 * - 値域 (`NaN` / `Infinity` / 負値 / 0) は本 handler では検証せずそのまま格納する
 * - エラー時に operand stack の部分消費は復元しない
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const yHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const operandsResult = OperandExtractor.popNumbers(
    context.operandStack,
    OPERATOR_NAME,
    OPERAND_COUNT,
  );
  if (!operandsResult.ok) {
    return err(operandsResult.error);
  }
  const [x1, y1, x3, y3] = operandsResult.value;

  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const currentPoint = CurrentPath.lastPoint(current.currentPath);
  if (!currentPoint.some) {
    const error: PdfError = {
      code: "OPERATOR_PATH_NO_CURRENT_POINT",
      message: `Operator '${OPERATOR_NAME}' requires a current point established by a prior 'm' or 're'`,
      operatorName: OPERATOR_NAME,
    };
    return err(error);
  }
  const nextPath = CurrentPath.append(
    current.currentPath,
    PathSegment.curveTo(x1, y1, x3, y3, x3, y3),
  );
  const next = GraphicsState.update(current, { currentPath: nextPath });
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
