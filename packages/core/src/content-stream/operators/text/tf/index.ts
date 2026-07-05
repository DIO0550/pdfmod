import type { PdfError } from "../../../../pdf/errors/index";
import { PdfName } from "../../../../pdf/types/pdf-types/index";
import { some } from "../../../../utils/option/index";
import { err, ok } from "../../../../utils/result/index";
import {
  GraphicsState,
  GraphicsStateStack,
  TextState,
} from "../../../graphics-state/index";
import { OperandStack } from "../../../operand-stack/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { NumericPdfObject } from "../../graphics-state/numeric-pdf-object/index";

const OPERATOR_NAME = "Tf";
const OPERAND_COUNT = 2;

/**
 * PDF §9.3.1 `Tf` operator (font and font size) のハンドラ。
 *
 * operand (PDF 順): `font` (name) `size` (number)。スタック頂上は size のため
 * size → font の順に 2 回 pop し、`textState.fontName` / `textState.fontSize` を更新する。
 *
 * - operand 不足: `OPERATOR_OPERAND_MISSING`（actual = pop 成功数 / required = 2）
 * - 型不一致: `OPERATOR_OPERAND_TYPE_MISMATCH`（size は "number"、font は "name"）
 * - エラー時に部分消費した operand stack は復元しない（既存ハンドラ規約）
 * - `Tf` は BT/ET の外でも呼べるため `textObject.active` は検査しない
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const tfHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const poppedSize = OperandStack.pop(context.operandStack);
  if (!poppedSize.some) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_MISSING",
      message: `Operator '${OPERATOR_NAME}' requires ${OPERAND_COUNT} operand(s), got 0`,
      operatorName: OPERATOR_NAME,
      required: OPERAND_COUNT,
      actual: 0,
    };
    return err(error);
  }

  const size = poppedSize.value;
  if (!NumericPdfObject.is(size)) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      message: `Operator '${OPERATOR_NAME}' expected number operand, got ${size.type}`,
      operatorName: OPERATOR_NAME,
      expected: "number",
      actual: size.type,
    };
    return err(error);
  }

  const poppedFont = OperandStack.pop(context.operandStack);
  if (!poppedFont.some) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_MISSING",
      message: `Operator '${OPERATOR_NAME}' requires ${OPERAND_COUNT} operand(s), got 1`,
      operatorName: OPERATOR_NAME,
      required: OPERAND_COUNT,
      actual: 1,
    };
    return err(error);
  }

  const font = poppedFont.value;
  if (!PdfName.is(font)) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      message: `Operator '${OPERATOR_NAME}' expected name operand, got ${font.type}`,
      operatorName: OPERATOR_NAME,
      expected: "name",
      actual: font.type,
    };
    return err(error);
  }

  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const nextTextState = TextState.update(current.textState, {
    fontName: some(font.value),
    fontSize: size.value,
  });
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
