import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { closeSubpathContext } from "../close-subpath";
import { fillStrokeEvenOddHandler } from "../fill-stroke-even-odd";

/**
 * PDF §8.5.3 `b*` operator (close, fill and stroke the path; even-odd rule) の
 * ハンドラ。
 *
 * `h` + `B*` と等価。current path の末尾に `PathSegment.close()` を append して
 * から `fillStrokeEvenOddHandler` に委譲する。委譲先を `fillStrokeHandler` では
 * なく even-odd 版にすることで、委譲チェーン上も fill rule が一貫する。
 * fill rule は operator 種別で表現するため state には書き込まない。
 *
 * clipping: 将来 `W` / `W*` が設定する pendingClip の適用は本 handler では
 * 行わない。pendingClip の適用ロジックは別 issue (W/W*) で、本 handler を含む
 * path finalization operator (`S` / `s` / `f` / `F` / `f*` / `B` / `B*` / `b` /
 * `b*` / `n`) に注入する。`n` は paint しないが `W n` で clip を確定させるため
 * 対象に含む。
 *
 * - operand 数: 0 (operand stack を一切参照しない)
 * - current path が空の場合は close を append せず、委譲先が no-op で返す
 * - currentPath 以外の graphics state は変更しない
 * - 本 handler では PdfError を返さない (常に ok)
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 更新後コンテキスト (常に ok)
 */
export const closeFillStrokeEvenOddHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => fillStrokeEvenOddHandler(closeSubpathContext(context));
