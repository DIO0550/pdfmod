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

const OPERATOR_NAME = "m";
const OPERAND_COUNT = 2;

/**
 * PDF §8.5.2 `m` operator (moveto) のハンドラ。
 *
 * operand stack から `x y` の 2 個の数値を pop し、
 * `PathSegment.moveTo(x, y)` で新しい subpath を開始した
 * 新しい GraphicsState を生成する (ISO 32000-1:2008 §8.5.2)。
 * 直前の path construction operator も `m` の場合は、前の `moveTo` を残さず
 * 上書きする (`CurrentPath.beginSubpath` が担う)。
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
  const operandsResult = OperandExtractor.popNumbers(
    context.operandStack,
    OPERATOR_NAME,
    OPERAND_COUNT,
  );
  if (!operandsResult.ok) {
    return err(operandsResult.error);
  }
  const [x, y] = operandsResult.value;

  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const nextPath = CurrentPath.beginSubpath(
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
    markedContentStack: context.markedContentStack,
  });
};
