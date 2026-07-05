import type { PdfError } from "../../../../pdf/errors/index";
import { PdfName } from "../../../../pdf/types/pdf-types/index";
import { err, ok } from "../../../../utils/result/index";
import { OperandStack } from "../../../operand-stack/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";

const OPERATOR_NAME = "Do";
const OPERAND_COUNT = 1;

/**
 * PDF §8.8 `Do` operator (invoke named XObject) のハンドラ。
 *
 * operand stack から name 1 個を pop し、name 型であれば受理して
 * operand を消費する骨格実装。XObject 解決と実体描画
 * (画像 decode / form XObject 再帰実行) は本フェーズでは行わず、
 * 後続フェーズで本 handler に追加する。
 *
 * 検査順序（厳守）:
 *   (1) operand pop（none なら `OPERATOR_OPERAND_MISSING`）
 *   (2) 型検査（PdfName.is が false なら `OPERATOR_OPERAND_TYPE_MISMATCH`）
 *
 * - 本フェーズの仕様により `textObject.active` は検査しない（BT/ET 内外で同じ動作）。
 * - name の妥当性（`/Resources` の `/XObject` への存在性）と value の値域（空文字 等）
 *   は本フェーズでは検証しない。
 * - graphics state は更新しないため、`graphicsStateStack` は入力と同一参照で返す。
 * - エラー時に部分消費した operand stack は復元しない（既存ハンドラ規約）。
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const doHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const popped = OperandStack.pop(context.operandStack);
  if (!popped.some) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_MISSING",
      message: `Operator '${OPERATOR_NAME}' requires ${OPERAND_COUNT} operand(s), got 0`,
      operatorName: OPERATOR_NAME,
      required: OPERAND_COUNT,
      actual: 0,
    };
    return err(error);
  }

  const operand = popped.value;
  if (!PdfName.is(operand)) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      message: `Operator '${OPERATOR_NAME}' expected name operand, got ${operand.type}`,
      operatorName: OPERATOR_NAME,
      expected: "name",
      actual: operand.type,
    };
    return err(error);
  }

  return ok({
    operandStack: context.operandStack,
    graphicsStateStack: context.graphicsStateStack,
    markedContentStack: context.markedContentStack,
  });
};
