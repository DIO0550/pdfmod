import {
  CurrentPath,
  GraphicsState,
  GraphicsStateStack,
} from "../../../graphics-state/index";
import type { OperatorHandlerContext } from "../../../operator-registry/index";

/**
 * current path の subpath を close した新しい実行コンテキストを返す。
 *
 * `h` / `s` / `b` / `b*` が共用する内部ヘルパで、operator handler ではない
 * (`PATH_OPERATORS` には登録しない)。
 *
 * - current path が空の場合は `context` をそのまま返す (graphicsStateStack も同一参照)。
 *   空 path に close を append すると `CurrentPath.isEmpty` が false に転じ、
 *   後続の `l` / `c` が依拠する `NO_CURRENT_POINT` 不変条件が崩れるため
 * - operandStack / markedContentStack は常に同一参照を引き継ぐ
 * - currentPath 以外の graphics state は変更しない
 * - 失敗しないため `Result` は返さない
 *
 * @param context - 実行コンテキスト
 * @returns subpath を close した新しいコンテキスト。空 path なら `context` 自身
 */
export const closeSubpathContext = (
  context: OperatorHandlerContext,
): OperatorHandlerContext => {
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  if (CurrentPath.isEmpty(current.currentPath)) {
    return context;
  }
  const next = GraphicsState.update(current, {
    currentPath: CurrentPath.closeSubpath(current.currentPath),
  });
  return {
    operandStack: context.operandStack,
    graphicsStateStack: GraphicsStateStack.replaceCurrent(
      context.graphicsStateStack,
      next,
    ),
    markedContentStack: context.markedContentStack,
  };
};
