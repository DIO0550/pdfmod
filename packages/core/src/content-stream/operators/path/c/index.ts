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

const OPERATOR_NAME = "c";
const OPERAND_COUNT = 6;

/**
 * PDF §8.5.2 `c` operator (cubic Bezier curve) のハンドラ。
 *
 * operand stack から `x1 y1 x2 y2 x3 y3` の 6 個の数値を pop し、
 * `PathSegment.curveTo(x1, y1, x2, y2, x3, y3)` を current path の末尾に append した
 * 新しい GraphicsState を生成する (ISO 32000-1:2008 §8.5.2)。
 * append 後の current point は追加された curveTo segment の終点 `(x3, y3)` として
 * 後続処理で解釈される (現行データモデルでは明示的 current point フィールドは持たない)。
 *
 * - operand 不足 (< 6) のとき `OPERATOR_OPERAND_MISSING` を返す
 *   `actual` には pop に成功した個数 (0..5) を入れる
 * - operand に integer / real 以外が混在したとき `OPERATOR_OPERAND_TYPE_MISMATCH` を返す
 * - current point が未確立 (先行する `m` / `re` がない / `currentPath` が空) の場合
 *   `OPERATOR_PATH_NO_CURRENT_POINT` を返す (§8.5.2: `c` は current point から伸ばす)
 * - 値域 (`NaN` / `Infinity` / 負値 / 0) は本 handler では検証せずそのまま格納する
 * - エラー時に operand stack の部分消費は復元しない (既存 cm / m / l handler 規約)
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const cHandler: OperatorHandler = (context: OperatorHandlerContext) => {
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

  // popped は LIFO 順 [y3, x3, y2, x2, y1, x1]。reverse して PDF 順 [x1, y1, x2, y2, x3, y3] に戻す
  const [x1, y1, x2, y2, x3, y3] = popped
    .slice()
    .reverse()
    .map((operand) => operand.value);

  const current = GraphicsStateStack.current(context.graphicsStateStack);
  if (CurrentPath.isEmpty(current.currentPath)) {
    const error: PdfError = {
      code: "OPERATOR_PATH_NO_CURRENT_POINT",
      message: `Operator '${OPERATOR_NAME}' requires a current point established by a prior 'm' or 're'`,
      operatorName: OPERATOR_NAME,
    };
    return err(error);
  }
  const nextPath = CurrentPath.append(
    current.currentPath,
    PathSegment.curveTo(x1, y1, x2, y2, x3, y3),
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
