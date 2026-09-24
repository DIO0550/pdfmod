import type { PdfError } from "../../../../pdf/errors/index";
import type { PdfInteger } from "../../../../pdf/types/pdf-types/index";
import { err, ok } from "../../../../utils/result/index";
import {
  GraphicsState,
  GraphicsStateStack,
  TextRenderingMode,
  TextState,
} from "../../../graphics-state/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { OperandExtractor } from "../../operand-extractor/index";

/** PDF §9.3.6 text rendering mode オペレータ名（PDF 表記の大小を保持）。 */
const OPERATOR_NAME = "Tr";

/**
 * PDF §9.3.6 `Tr render` operator (text rendering mode) のハンドラ。
 * operand を 1 個 pop し、0〜7 の integer であれば
 * `textState.renderingMode` を `TextRenderingMode.create(n)` で更新する。
 *
 * - operand stack が空なら `OPERATOR_OPERAND_MISSING` を返す
 * - 末尾が integer 以外（real / name / boolean / array / ...）なら
 *   `OPERATOR_OPERAND_TYPE_MISMATCH` を返す（real 3.14 / 3.0 も TYPE_MISMATCH）
 * - 末尾 integer の値が 0〜7 以外（8 / -1 / MAX_SAFE_INTEGER 等）なら
 *   `OPERATOR_OPERAND_VALUE_OUT_OF_RANGE` を返す（`allowed = TextRenderingMode.allowed`）
 * - エラー時に部分消費した operand stack は復元しない（既存ハンドラ規約）
 * - `Tr` は BT/ET の外でも呼べるため `textObject.active` は検査しない
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const trHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const operandResult = OperandExtractor.popOperand(
    context.operandStack,
    OPERATOR_NAME,
    (o): o is PdfInteger => o.type === "integer",
    "integer",
  );
  if (!operandResult.ok) {
    return err(operandResult.error);
  }

  const operand = operandResult.value;

  const value = operand.value;
  if (!TextRenderingMode.isValid(value)) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_VALUE_OUT_OF_RANGE",
      message: `Operator '${OPERATOR_NAME}' operand value ${value} is out of range, expected one of [${TextRenderingMode.allowed.join(", ")}]`,
      operatorName: OPERATOR_NAME,
      allowed: TextRenderingMode.allowed,
      actual: value,
    };
    return err(error);
  }

  const renderingMode = TextRenderingMode.create(value);
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const nextTextState = TextState.update(current.textState, { renderingMode });
  const next = GraphicsState.update(current, { textState: nextTextState });
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
