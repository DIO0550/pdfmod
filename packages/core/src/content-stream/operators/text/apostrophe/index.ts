import type { PdfError } from "../../../../pdf/errors/index";
import { err, ok } from "../../../../utils/result/index";
import {
  GraphicsState,
  GraphicsStateStack,
  TextObject,
} from "../../../graphics-state/index";
import { OperandStack } from "../../../operand-stack/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";

/** PDF 表記を保持した operator 名（"'"）。 */
const OPERATOR_NAME = "'";

/**
 * PDF §9.4.3 `'` (apostrophe / move to next line and show text) operator のハンドラ。
 *
 * `string '` は `T* string Tj` と等価。current の `textState.leading` を参照し、
 * `TextObject.translateLine(textObject, 0, -leading)` でテキスト行列を次行頭へ
 * 移動した上で、string operand を受理する（`'` 自体は 1 個の string operand を消費）。
 *
 * 検査順序（厳守）:
 *   (1) active 検査（false なら `OPERATOR_ILLEGAL_STATE` を返す）
 *   (2) operand pop（none なら `OPERATOR_OPERAND_MISSING`）
 *   (3) 型検査（type !== "string" なら `OPERATOR_OPERAND_TYPE_MISMATCH`）
 *
 * - text object が active でない場合は `OPERATOR_ILLEGAL_STATE` を返す
 *   （operand stack / graphics state stack は変更しない）
 * - operand stack が空なら `OPERATOR_OPERAND_MISSING` を返す
 *   （graphics state stack は変更しない）
 * - 末尾が string 以外なら `OPERATOR_OPERAND_TYPE_MISMATCH` を返す
 *   （エラー時に部分消費した operand stack は復元しない — 既存ハンドラ規約）
 * - `leading` の値域（負値 / `NaN` / `Infinity`）は本 handler では検証しない
 *   （`tStarHandler` と同一規約。`translateLine` に素通しさせる）
 * - フォント幅辞書が未実装のため、本フェーズでは描画後の advance 計算と
 *   描画イベント発火は行わない（`tjHandler` と同一規約）。
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const apostropheHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => {
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  if (!TextObject.isActive(current.textObject)) {
    const error: PdfError = {
      code: "OPERATOR_ILLEGAL_STATE",
      message: "': text object is not active (' must appear within BT/ET)",
      operatorName: OPERATOR_NAME,
    };
    return err(error);
  }

  const popped = OperandStack.pop(context.operandStack);
  if (!popped.some) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_MISSING",
      message: `Operator '${OPERATOR_NAME}' requires 1 operand(s), got 0`,
      operatorName: OPERATOR_NAME,
      required: 1,
      actual: 0,
    };
    return err(error);
  }

  const operand = popped.value;
  if (operand.type !== "string") {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      message: `Operator '${OPERATOR_NAME}' expected string operand, got ${operand.type}`,
      operatorName: OPERATOR_NAME,
      expected: "string",
      actual: operand.type,
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
