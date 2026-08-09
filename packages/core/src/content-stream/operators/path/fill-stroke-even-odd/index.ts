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
 * clipping: 将来 `W` / `W*` が設定する pendingClip の適用は本 handler では
 * 行わない。pendingClip の適用ロジックは別 issue (W/W*) で、本 handler を含む
 * path finalization operator (`S` / `s` / `f` / `F` / `f*` / `B` / `B*` / `b` /
 * `b*` / `n`) に注入する。`n` は paint しないが `W n` で clip を確定させるため
 * 対象に含む。
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
