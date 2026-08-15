import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { fillStrokeHandler } from "../fill-stroke";

/**
 * PDF §8.5.3 `B*` operator (fill the path, then stroke it; even-odd rule) の
 * ハンドラ。
 *
 * state 更新は `B` と同一のため `fillStrokeHandler` に委譲する。fill rule は
 * state ではなく operator 種別で表現するため、別名 export にせず**別の関数実体**
 * として定義する。fill と stroke の合成順序も renderer 側の責務。
 *
 * clipping: pendingClip の消費は委譲先の handler が行う
 * (ISO 32000-1:2008 §8.5.4)。本ラッパー自身は clipping に関与しないため、
 * 委譲先を経由すれば `W` / `W*` の指定は自動的に確定する。
 *
 * - operand 数: 0 (operand stack を一切参照しない)
 * - current path が空の場合は委譲先が no-op で返す
 * - currentPath 以外の graphics state は変更しない
 * - 本 handler では PdfError を返さない (常に ok)
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 更新後コンテキスト (常に ok)
 */
export const fillStrokeEvenOddHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => fillStrokeHandler(context);
