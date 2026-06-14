import type { PdfError } from "../../../../pdf/errors/index";
import { err, ok } from "../../../../utils/result/index";
import { GraphicsStateStack, TextObject } from "../../../graphics-state/index";
import { OperandStack } from "../../../operand-stack/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";

/** PDF 表記を保持した operator 名（"Tj"）。 */
const OPERATOR_NAME = "Tj";

/**
 * PDF §9.4.3 `Tj` operator (show a text string) のハンドラ。
 * operand を 1 個 pop し、string であれば受理して operand を消費する。
 *
 * 検査順序（厳守）:
 *   (1) active 検査（false なら `OPERATOR_ILLEGAL_STATE` を返す）
 *   (2) operand pop（none なら `OPERATOR_OPERAND_MISSING`）
 *   (3) 型検査（type !== "string" なら `OPERATOR_OPERAND_TYPE_MISMATCH`）
 *
 * - text object が active でない場合は `OPERATOR_ILLEGAL_STATE` を返す
 *   （operand stack / graphics state stack は変更しない）
 * - operand stack が空なら `OPERATOR_OPERAND_MISSING` を返す
 * - 末尾が string 以外なら `OPERATOR_OPERAND_TYPE_MISMATCH` を返す
 * - string 値の妥当性（バイト長・符号化）は本フェーズでは検証しない
 * - 本フェーズでは textMatrix の平行移動（テキスト送り / advance）を行わない。
 *   フォント幅辞書・文字間隔・単語間隔・水平スケール等が未実装のため、
 *   graphics state stack は同一参照のまま返す。後続フォントフェーズで
 *   本 handler にテキスト送りと描画イベント発火が追加される。
 * - エラー時に部分消費した operand stack は復元しない（既存ハンドラ規約）
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const tjHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  if (!TextObject.isActive(current.textObject)) {
    const error: PdfError = {
      code: "OPERATOR_ILLEGAL_STATE",
      message: "Tj: text object is not active (Tj must appear within BT/ET)",
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

  return ok({
    operandStack: context.operandStack,
    graphicsStateStack: context.graphicsStateStack,
  });
};
