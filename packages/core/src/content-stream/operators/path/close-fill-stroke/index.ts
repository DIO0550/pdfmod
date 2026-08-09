import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { closeSubpathContext } from "../close-subpath";
import { fillStrokeHandler } from "../fill-stroke";

/**
 * PDF §8.5.3 `b` operator (close, fill and stroke the path;
 * nonzero winding number rule) のハンドラ。
 *
 * `h` + `B` と等価。current path の末尾に `PathSegment.close()` を append して
 * から `fillStrokeHandler` に委譲する。fill rule (nonzero winding / even-odd) は
 * state ではなく operator 種別 (`B` / `B*` / `b` / `b*`) で表現する。
 *
 * clipping: 将来 `W` / `W*` が設定する pendingClip の適用は本 handler では
 * 行わない。pendingClip の適用ロジックは別 issue (W/W*) で、本 handler を含む
 * path finalization operator (`S` / `s` / `f` / `F` / `f*` / `B` / `B*` / `b` /
 * `b*` / `n`) に注入する。`n` は paint しないが `W n` で clip を確定させるため
 * 対象に含む。
 *
 * 命名: PDF 仕様上の大文字 `B` (fill+stroke) と小文字 `b`
 * (close-and-fill-stroke) は別 operator のため semantic 名
 * `close-fill-stroke` を使う。
 *
 * - operand 数: 0 (operand stack を一切参照しない)
 * - current path が空の場合は close を append せず、委譲先が no-op で返す
 * - currentPath 以外の graphics state は変更しない
 * - 本 handler では PdfError を返さない (常に ok)
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 更新後コンテキスト (常に ok)
 */
export const closeFillStrokeHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => fillStrokeHandler(closeSubpathContext(context));
