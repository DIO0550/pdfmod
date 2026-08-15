import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { fillHandler } from "../fill";

/**
 * PDF §8.5.3 `f*` operator (fill the path, even-odd rule) のハンドラ。
 *
 * state 更新は `f` と同一 (current path を `CurrentPath.empty()` にリセット)
 * のため `fillHandler` に委譲する。fill rule (nonzero winding / even-odd) は
 * state ではなく operator 種別で表現するため、`fillHandler` の別名 export に
 * せず**別の関数実体**として定義する。registry 上で `f` と `f*` が別 handler
 * に対応することが fill rule の唯一の表現。ただしこの区別は registry の
 * マッピングまでで、委譲後の `fillHandler` 内部には届かない。renderer 実装時に
 * は本 handler が委譲をやめ、fill rule を明示引数で受ける共通 paint 関数を
 * 呼ぶ形へ変更する必要がある (別 issue)。
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
export const fillEvenOddHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => fillHandler(context);
