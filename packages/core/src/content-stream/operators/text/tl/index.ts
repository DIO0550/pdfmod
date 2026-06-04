import type { PdfError } from "../../../../pdf/errors/index";
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

const OPERATOR_NAME = "TL";

/**
 * PDF §9.3.5 `TL` operator (text leading) のハンドラ。
 * operand を 1 個 pop し、number であれば `textState.leading` を更新する。
 * leading は後続の `T*` / `TD` / `'` / `"` で参照される。
 *
 * - operand stack が空なら `OPERATOR_OPERAND_MISSING` を返す
 * - 末尾が number 以外なら `OPERATOR_OPERAND_TYPE_MISMATCH` を返す
 * - 値域検証はしない（負値・小数・`0`・`NaN`・`Infinity` をそのまま格納する）
 * - エラー時に部分消費した operand stack は復元しない（既存ハンドラ規約）
 * - `TL` は BT/ET の外でも呼べるため `textObject.active` は検査しない
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const tlHandler: OperatorHandler = (context: OperatorHandlerContext) => {
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
  if (!NumericPdfObject.is(operand)) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      message: `Operator '${OPERATOR_NAME}' expected number operand, got ${operand.type}`,
      operatorName: OPERATOR_NAME,
      expected: "number",
      actual: operand.type,
    };
    return err(error);
  }

  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const nextTextState = TextState.update(current.textState, {
    leading: operand.value,
  });
  const next = GraphicsState.update(current, { textState: nextTextState });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    context.graphicsStateStack,
    next,
  );

  return ok({
    operandStack: context.operandStack,
    graphicsStateStack,
  });
};
