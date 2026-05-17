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
 * PDF §8.5.3 `S` operator (stroke the path) のハンドラ。
 *
 * operand を pop せず、実行後 current path を `CurrentPath.empty()` に
 * リセットした新しい GraphicsState を生成する (ISO 32000-1:2008 §8.5.3:
 * painting operators consume the current path)。`S` は引数を取らないため
 * operand stack に値が残っていても pop / 検証 / clear のいずれも行わず、
 * 同一参照のまま返す。
 *
 * 命名: PDF 仕様上の大文字 `S` (stroke) と小文字 `s` (close-and-stroke) は
 * 別 operator のため、letter ディレクトリではなく semantic 名 `stroke` を使う。
 *
 * - operand 数: 0 (operand stack を一切参照しない)
 * - current path が空の場合は no-op で同一 operandStack / graphicsStateStack
 *   参照を含む新 context を返す
 * - 実際のラスタライズは本ライブラリのスコープ外。state の path リセットのみ
 * - ctm / lineWidth / lineCap / lineJoin / miterLimit など
 *   currentPath 以外の graphics state は変更しない
 * - 本 handler では PdfError を返さない (常に ok)
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 更新後コンテキスト (常に ok)
 */
export const strokeHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => {
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  if (CurrentPath.isEmpty(current.currentPath)) {
    return ok({
      operandStack: context.operandStack,
      graphicsStateStack: context.graphicsStateStack,
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
  });
};
