import { ok } from "../../../../utils/result/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { closeSubpathContext } from "../close-subpath";

/**
 * PDF §8.5.2 `h` operator (close subpath) のハンドラ。
 *
 * operand を pop せず、current path の末尾に `PathSegment.close()` を
 * append した新しい GraphicsState を生成する (ISO 32000-1:2008 §8.5.2)。
 * close 処理そのものは `s` / `b` / `b*` と共通のため `closeSubpathContext`
 * に集約している。`h` は引数を取らないオペレータのため、operand stack に値が
 * 残っていても pop / 検証 / clear のいずれも行わず、同一参照のまま返す。
 *
 * - operand 数: 0 (operand stack を一切参照しない)
 * - current path が空 (current point 未確立) の場合は no-op で同一 context を返す。
 *   無条件に `close` を append すると `CurrentPath.isEmpty` が false に転じ、
 *   後続の `l` / `c` が依拠する `NO_CURRENT_POINT` 不変条件が崩れるため。
 * - ctm / lineWidth / lineCap / lineJoin / miterLimit など
 *   currentPath 以外の graphics state は変更しない
 * - 本 handler では PdfError を返さない (常に ok)
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 更新後コンテキスト (常に ok)
 */
export const hHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const closed = closeSubpathContext(context);
  return ok({
    operandStack: closed.operandStack,
    graphicsStateStack: closed.graphicsStateStack,
    markedContentStack: closed.markedContentStack,
  });
};
