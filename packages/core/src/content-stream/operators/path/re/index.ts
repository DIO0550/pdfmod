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

const OPERATOR_NAME = "re";
const OPERAND_COUNT = 4;

/**
 * PDF §8.5.2 `re` operator (rectangle) のハンドラ。
 *
 * operand stack から `x y width height` の 4 個の数値を pop し、
 * `PathSegment.rect(x, y, width, height)` を current path の末尾に append する
 * (ISO 32000-1:2008 §8.5.2)。`re` は自身が新しい subpath を開始するため、
 * 直前に `m` 等で current point を確立する必要は無い
 * (`CurrentPath.isEmpty` ガードを設けず無条件に append する)。
 *
 * - operand 不足 (< 4) のとき `OPERATOR_OPERAND_MISSING` を返す
 *   `actual` には pop に成功した個数 (0..3) を入れる
 * - operand に integer / real 以外が混在したとき `OPERATOR_OPERAND_TYPE_MISMATCH` を返す
 * - 値域 (`NaN` / `Infinity` / 負値 / 0) は本 handler では検証せずそのまま格納する
 *   (negative width/height は PDF 仕様で許容され、renderer 側で解釈される)
 * - エラー時に operand stack の部分消費は復元しない (既存 m/l/c handler 規約)
 * - `OPERATOR_PATH_NO_CURRENT_POINT` は返さない (re は current point 不要)
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const reHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const operandsResult = OperandExtractor.popNumbers(
    context.operandStack,
    OPERATOR_NAME,
    OPERAND_COUNT,
  );
  if (!operandsResult.ok) {
    return err(operandsResult.error);
  }
  const [x, y, width, height] = operandsResult.value;

  const current = GraphicsStateStack.current(context.graphicsStateStack);
  // re は自身が subpath を開始するため CurrentPath.isEmpty ガードは設けず無条件 append
  const nextPath = CurrentPath.append(
    current.currentPath,
    PathSegment.rect(x, y, width, height),
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
