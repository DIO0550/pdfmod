import { ok } from "../../../../utils/result/index";
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

/**
 * PDF §8.5.2 `h` operator (close subpath) のハンドラ。
 *
 * operand を pop せず、current path の末尾に `PathSegment.close()` を
 * append した新しい GraphicsState を生成する (ISO 32000-1:2008 §8.5.2)。
 * `h` は引数を取らないオペレータのため、operand stack に値が残っていても
 * pop / 検証 / clear のいずれも行わず、同一参照のまま返す。
 *
 * - operand 数: 0 (operand stack を一切参照しない)
 * - current path が空でも `close` segment を append する
 *   (path semantics の判断は後段 renderer の責務。l / c のように
 *    `OPERATOR_PATH_NO_CURRENT_POINT` を返すことはしない)
 * - ctm / lineWidth / lineCap / lineJoin / miterLimit など
 *   currentPath 以外の graphics state は変更しない
 * - 本 handler では PdfError を返さない (常に ok)
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 更新後コンテキスト (常に ok)
 */
export const hHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const nextPath = CurrentPath.append(current.currentPath, PathSegment.close());
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
