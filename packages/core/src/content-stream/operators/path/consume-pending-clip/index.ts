import { none } from "../../../../utils/option/index";
import {
  GraphicsState,
  GraphicsStateStack,
} from "../../../graphics-state/index";
import type { OperatorHandlerContext } from "../../../operator-registry/index";

/**
 * pending 状態のクリッピングパスを消費した新しい実行コンテキストを返す。
 *
 * path-painting operator (`S` / `s` / `f` / `F` / `f*` / `B` / `B*` / `b` /
 * `b*` / `n`) が共用する内部ヘルパで, operator handler ではない
 * (`PATH_OPERATORS` には登録しない)。
 *
 * ISO 32000-1:2008 §8.5.4: `W` / `W*` はクリッピングパスを即座には適用せず、
 * 直後の path-painting operator で確定する。本ヘルパがその「確定」に相当する。
 *
 * - `pendingClip` が `none` の場合は `context` をそのまま返す (graphicsStateStack
 *   も同一参照)。クリッピングを使わない既存コンテンツの振る舞いを変えないため
 * - current path が空かどうかは見ない。paint handler の早期 return より前に
 *   呼ぶことで、空 path に対する `W n` でも pendingClip が確実に消費される
 * - クリッピング領域そのものは保持しない。領域の集合演算は renderer 層の責務
 * - operandStack / markedContentStack は常に同一参照を引き継ぐ
 * - pendingClip 以外の graphics state は変更しない
 * - 失敗しないため `Result` は返さない
 *
 * @param context - 実行コンテキスト
 * @returns pendingClip を none に戻した新しいコンテキスト。既に none なら `context` 自身
 */
export const consumePendingClipContext = (
  context: OperatorHandlerContext,
): OperatorHandlerContext => {
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  if (!current.pendingClip.some) {
    return context;
  }
  const next = GraphicsState.update(current, { pendingClip: none });
  return {
    operandStack: context.operandStack,
    graphicsStateStack: GraphicsStateStack.replaceCurrent(
      context.graphicsStateStack,
      next,
    ),
    markedContentStack: context.markedContentStack,
  };
};
