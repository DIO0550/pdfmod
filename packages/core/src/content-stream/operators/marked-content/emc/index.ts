import type { PdfError } from "../../../../pdf/errors/index";
import { err, ok } from "../../../../utils/result/index";
import { MarkedContentStack } from "../../../marked-content/stack/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";

/** PDF 表記を保持した operator 名（"EMC"）。 */
const OPERATOR_NAME = "EMC";

/**
 * ISO 32000-2:2020 §14.6 `EMC` operator (end marked-content sequence) のハンドラ。
 *
 * marked content stack の末尾 1 段を pop して閉じる。`bmcHandler` の push の鏡像。
 *
 * 検査順序（厳守）:
 *   (1) MarkedContentStack.pop（none = 開いている sequence 無し → OPERATOR_ILLEGAL_STATE）
 *   (2) some なら markedContentStack を pop 後 stack へ差し替えて ok
 *
 * - operand 数: 0（operand stack を一切 pop / 検証 / clear しない。余剰 operand は非消費）。
 * - 更新するのは markedContentStack のみ。operandStack / graphicsStateStack は入力と同一参照。
 * - 開いている marked-content sequence が無い（unmatched EMC）場合は OPERATOR_ILLEGAL_STATE。
 *   operator handler は byte offset を持たないため offset は付けない。
 *
 * @param context - 実行コンテキスト
 * @returns 更新後コンテキスト、または unmatched EMC 時の PdfError
 */
export const emcHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => {
  const popped = MarkedContentStack.pop(context.markedContentStack);
  if (!popped.some) {
    const error: PdfError = {
      code: "OPERATOR_ILLEGAL_STATE",
      message: "EMC: no open marked-content sequence (EMC without BMC/BDC)",
      operatorName: OPERATOR_NAME,
    };
    return err(error);
  }

  return ok({
    operandStack: context.operandStack,
    graphicsStateStack: context.graphicsStateStack,
    markedContentStack: popped.value.stack,
  });
};
