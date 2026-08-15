import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { closeSubpathContext } from "../close-subpath";
import { strokeHandler } from "../stroke";

/**
 * PDF §8.5.3 `s` operator (close the subpath, then stroke it) のハンドラ。
 *
 * `h` + `S` と等価 (ISO 32000-1:2008 §8.5.3)。current path の末尾に
 * `PathSegment.close()` を append してから `strokeHandler` に委譲し、
 * paint 側で current path を `CurrentPath.empty()` にリセットする。
 * `s` は引数を取らないため operand stack に値が残っていても
 * pop / 検証 / clear のいずれも行わず、同一参照のまま返す。
 *
 * close 動作は `closeSubpathContext` 経由で state に反映するが、直後に
 * paint が path を消費するため GraphicsState 上には残らない。将来 paint
 * handler に renderer フックを差し込んだ時点で close 済みの path が渡る。
 * fill rule (nonzero winding / even-odd) は handler 種別で表現するため state
 * には書き込まない。`s` は fill を行わないため fill rule を持たない。
 *
 * clipping: pendingClip の消費は委譲先の handler が行う
 * (ISO 32000-1:2008 §8.5.4)。本ラッパー自身は clipping に関与しないため、
 * 委譲先を経由すれば `W` / `W*` の指定は自動的に確定する。
 *
 * 命名: PDF 仕様上の大文字 `S` (stroke) と小文字 `s` (close-and-stroke) は
 * 別 operator のため、letter ディレクトリではなく semantic 名 `close-stroke` を使う。
 *
 * - operand 数: 0 (operand stack を一切参照しない)
 * - current path が空の場合は close を append せず、委譲先が no-op で
 *   同一 operandStack / graphicsStateStack 参照を含む context を返す
 * - ctm / lineWidth / lineCap / lineJoin / miterLimit など
 *   currentPath 以外の graphics state は変更しない
 * - 本 handler では PdfError を返さない (常に ok)
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 更新後コンテキスト (常に ok)
 */
export const closeStrokeHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => strokeHandler(closeSubpathContext(context));
