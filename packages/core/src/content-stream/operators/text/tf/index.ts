import { some } from "../../../../utils/option/index";
import { err, ok } from "../../../../utils/result/index";
import {
  GraphicsState,
  GraphicsStateStack,
  TextState,
} from "../../../graphics-state/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { OperandExtractor } from "../../operand-extractor/index";

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
  const sizeResult = OperandExtractor.popNumber(
    context.operandStack,
    OPERATOR_NAME,
    OPERAND_COUNT,
    0,
  );
  if (!sizeResult.ok) {
    return err(sizeResult.error);
  }
  const sizeValue = sizeResult.value;

  const fontResult = OperandExtractor.popName(
    context.operandStack,
    OPERATOR_NAME,
    OPERAND_COUNT,
    1,
  );
  if (!fontResult.ok) {
    return err(fontResult.error);
  }
  const fontName = fontResult.value;

  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const nextTextState = TextState.update(current.textState, {
    fontName: some(fontName),
    fontSize: sizeValue,
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
