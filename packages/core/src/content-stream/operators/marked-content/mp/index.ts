import type { PdfError } from "../../../../pdf/errors/index";
import { PdfName } from "../../../../pdf/types/pdf-types/index";
import { err, ok } from "../../../../utils/result/index";
import { OperandStack } from "../../../operand-stack/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";

const OPERATOR_NAME = "MP";
const OPERAND_COUNT = 1;

/**
 * ISO 32000-1:2008 §14.6 `MP` operator (marked-content point) のハンドラ。
 *
 * operand stack から tag (name) を 1 個 pop し、name 型であれば
 * marked content stack を変化させずに現在のコンテキストを返す。
 * MP は「単発マーク点」であり BMC/EMC の対を持たないため、
 * MarkedContentStack への push は行わない。
 *
 * 検査順序（厳守 / doHandler 準拠）:
 *   (1) operand pop（none なら `OPERATOR_OPERAND_MISSING`）
 *   (2) 型検査（PdfName.is が false なら `OPERATOR_OPERAND_TYPE_MISMATCH`）
 *   (3) 両方通過 → 3 つの stack を同一参照で列挙して ok
 *
 * - tag の値域（空文字 等）は検証しない。
 * - operandStack は pop で in-place 消費済み。graphicsStateStack と
 *   markedContentStack は入力と同一参照で返す。
 * - エラー時に部分消費した operand stack は復元しない（既存ハンドラ規約）。
 *
 * @param context - 実行コンテキスト
 * @returns 成功なら入力と同じ 3 stack を持つコンテキスト、失敗なら PdfError
 */
export const mpHandler: OperatorHandler = (context: OperatorHandlerContext) => {
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
