import type { PdfError } from "../../../../pdf/errors/index";
import { err, ok } from "../../../../utils/result/index";
import {
  GraphicsState,
  GraphicsStateStack,
  TextObject,
} from "../../../graphics-state/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";

/** PDF 表記を保持した operator 名（"T*"）。 */
const OPERATOR_NAME = "T*";

/**
 * PDF §9.4.2 `T*` operator (Move to start of next line) のハンドラ。
 *
 * `0 -TL Td` と等価。current の `textState.leading` を参照し、
 * `TextObject.translateLine(textObject, 0, -leading)` でテキスト行列を
 * 次行頭へ移動する（`Tlm' = translate(0, -TL) × Tlm`、`Tm' = Tlm'`）。
 * `T*` は BT 〜 ET の内側でのみ有効。引数を取らないため operand stack を
 * pop / 検証 / clear せず同一参照のまま返す。
 *
 * 検査順序（厳守）:
 *   (1) active 検査（false なら `OPERATOR_ILLEGAL_STATE` を返す）
 *
 * - operand 数: 0（operand stack を一切消費しない）
 * - text object が active でない場合は `OPERATOR_ILLEGAL_STATE` を返す
 *   （operand stack / graphics state stack は変更しない）
 * - エラー時に operand stack は変更されない（pop を行わないため復元も不要）
 * - `leading` は参照のみで textState は更新しない（`TD` との差分）
 * - `leading` の値域（`NaN` / `Infinity`）は本 handler では検証しない
 *   （`TD` が設定した値をそのまま使う）
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const tStarHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => {
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  if (!TextObject.isActive(current.textObject)) {
    const error: PdfError = {
      code: "OPERATOR_ILLEGAL_STATE",
      message: "T*: text object is not active (T* must appear within BT/ET)",
      operatorName: OPERATOR_NAME,
    };
    return err(error);
  }

  const leading = current.textState.leading;
  const textObject = TextObject.translateLine(current.textObject, 0, -leading);
  const next = GraphicsState.update(current, { textObject });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    context.graphicsStateStack,
    next,
  );
  return ok({
    operandStack: context.operandStack,
    graphicsStateStack,
    markedContentStack: context.markedContentStack,
  });
};
