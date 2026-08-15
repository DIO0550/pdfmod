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
 * clipping: pendingClip の消費は委譲先の handler が行う
 * (ISO 32000-1:2008 §8.5.4)。本ラッパー自身は clipping に関与しないため、
 * 委譲先を経由すれば `W` / `W*` の指定は自動的に確定する。
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
