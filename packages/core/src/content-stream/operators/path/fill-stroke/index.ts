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

/**
 * PDF §8.5.3 `B` operator (fill the path, then stroke it; nonzero winding number rule) のハンドラ。
 *
 * operand を pop せず、実行後 current path を `CurrentPath.empty()` に
 * リセットした新しい GraphicsState を生成する (ISO 32000-1:2008 §8.5.3:
 * painting operators consume the current path)。`B` は引数を取らないため
 * operand stack に値が残っていても pop / 検証 / clear のいずれも行わず、
 * 同一参照のまま返す。
 *
 * fill rule (nonzero winding / even-odd) は operator 種別 (`B` / `B*`) で
 * 表現するため state には書き込まない。一方 close 動作 (`b` / `b*`) は
 * 呼び出し側の handler が `closeSubpathContext` で current path に
 * `PathSegment.close()` を append してから本 handler に委譲する形で表現する。
 * また fill と stroke の合成順序 (`B` では fill → stroke) は renderer 側の
 * 責務であり、本 handler は path リセットのみを担当する。実際のラスタライズは
 * ライブラリのスコープ外で、ピクセル描画は将来 renderer 側が operator 種別から
 * fill rule / fill+stroke の合成順序を解釈する。
 *
 * 命名: PDF 仕様上の大文字 `B` (fill+stroke) と小文字 `b` (close-and-fill-stroke)
 * は別 operator のため、letter ディレクトリではなく semantic 名 `fill-stroke` を使う。
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
export const fillStrokeHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => {
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  if (CurrentPath.isEmpty(current.currentPath)) {
    return ok({
      operandStack: context.operandStack,
      graphicsStateStack: context.graphicsStateStack,
      markedContentStack: context.markedContentStack,
    });
  }
  const next = GraphicsState.update(current, {
    currentPath: CurrentPath.empty(),
  });
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
