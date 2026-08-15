import { ok } from "../../../../utils/result/index";
import {
  CurrentPath,
  GraphicsState,
  GraphicsStateStack,
} from "../../../graphics-state/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { consumePendingClipContext } from "../consume-pending-clip";

/**
 * PDF §8.5.3 `n` operator (end the path object without filling or stroking) の
 * ハンドラ。
 *
 * operand を pop せず、current path を `CurrentPath.empty()` にリセットした
 * 新しい GraphicsState を生成する (ISO 32000-1:2008 §8.5.3)。塗りも線描も
 * 行わないため、`f` / `S` / `B` と state 更新は同じでも別 handler 実体として
 * 定義する (委譲すると将来 renderer フック導入時に誤って描画してしまう)。
 *
 * fill rule (nonzero winding / even-odd) は paint handler の種別で表現するため
 * state には書き込まない。`n` は paint を行わないため fill rule を持たない。
 * clipping: 主用途は `W n` / `W* n` によるクリッピングパスの確定
 * (ISO 32000-1:2008 §8.5.4, `docs/specs/05_content_streams.md` §4.3)。
 * pendingClip が some の場合は consumePendingClipContext で消費して none に
 * 戻す。current path が空でも消費する。クリッピング領域自体は保持しない
 * (領域の集合演算は renderer 層の責務)。
 *
 * - operand 数: 0 (operand stack を一切参照しない)
 * - current path が空の場合は no-op で同一 operandStack / graphicsStateStack
 *   参照を含む新 context を返す
 * - ctm / lineWidth / lineCap / lineJoin / miterLimit など
 *   currentPath 以外の graphics state は変更しない
 * - 本 handler では PdfError を返さない (常に ok)
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 更新後コンテキスト (常に ok)
 */
export const endPathHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => {
  // §8.5.4: pending 中のクリッピングは paint operator で確定する。
  // current path の空判定より前に消費することで、空 path の `W n` でも
  // pendingClip が残らない。pendingClip が none なら同一参照が返る。
  const clipped = consumePendingClipContext(context);
  const current = GraphicsStateStack.current(clipped.graphicsStateStack);
  if (CurrentPath.isEmpty(current.currentPath)) {
    return ok({
      operandStack: clipped.operandStack,
      graphicsStateStack: clipped.graphicsStateStack,
      markedContentStack: clipped.markedContentStack,
    });
  }
  const next = GraphicsState.update(current, {
    currentPath: CurrentPath.empty(),
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    clipped.graphicsStateStack,
    next,
  );
  return ok({
    operandStack: clipped.operandStack,
    graphicsStateStack,
    markedContentStack: clipped.markedContentStack,
  });
};
