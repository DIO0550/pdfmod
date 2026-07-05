import type { PdfError } from "../../../../pdf/errors/index";
import { err, ok } from "../../../../utils/result/index";
import {
  GraphicsState,
  GraphicsStateStack,
  TextObject,
  TextState,
} from "../../../graphics-state/index";
import { OperandStack } from "../../../operand-stack/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { NumericPdfObject } from "../../graphics-state/numeric-pdf-object/index";

/** PDF 表記を保持した operator 名（"TD"）。 */
const OPERATOR_NAME = "TD";

/**
 * PDF §9.4.2 `TD` operator (Move to start of next line and set leading) のハンドラ。
 *
 * operand stack から `tx ty` を pop し、`Td` 相当の行列更新
 * （`Tlm' = translate(tx, ty) × Tlm`、`Tm' = Tlm'`）に加えて
 * `textState.leading = -ty`（PDF 仕様上 `-ty TL` 相当）を設定する。
 * 行列更新（textObject）と leading 設定（textState）は 1 回の
 * `GraphicsState.update` で同時反映する。`TD` は BT 〜 ET の内側でのみ有効。
 *
 * 検査順序（厳守。`Td` と同一規約）:
 *   (1) active 検査（false なら operand stack を一切消費せず Err）
 *   (2) ty pop  → (3) ty 型検査
 *   (4) tx pop  → (5) tx 型検査
 *
 * - text object が active でない場合は `OPERATOR_ILLEGAL_STATE` を返す
 *   （operand stack / graphics state stack は変更しない）
 * - operand 不足のとき `OPERATOR_OPERAND_MISSING` を返す。
 *   `actual` には pop に成功した個数（ty 不足なら 0 / tx 不足なら 1）を入れる
 * - operand が integer / real 以外のとき `OPERATOR_OPERAND_TYPE_MISMATCH` を返す
 * - 値域（`NaN` / `Infinity` / 負値 / `0` / 小数）は本 handler では検証しない
 *   （`-ty` 反転後の値をそのまま格納する）
 * - エラー時に operand stack の部分消費は復元しない（既存ハンドラ規約）
 *
 * operand 順序: PDF 表記 `tx ty TD` のスタック頂上は ty。
 * したがって ty を先に pop、tx を後に pop する。
 * leading にのみ `-ty`（符号反転）を入れ、translateLine には反転前の生 ty を渡す。
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const tdLeadingHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => {
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  if (!TextObject.isActive(current.textObject)) {
    const error: PdfError = {
      code: "OPERATOR_ILLEGAL_STATE",
      message: "TD: text object is not active (TD must appear within BT/ET)",
      operatorName: OPERATOR_NAME,
    };
    return err(error);
  }

  const poppedTy = OperandStack.pop(context.operandStack);
  if (!poppedTy.some) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_MISSING",
      message: `Operator '${OPERATOR_NAME}' requires 2 operand(s), got 0`,
      operatorName: OPERATOR_NAME,
      required: 2,
      actual: 0,
    };
    return err(error);
  }
  const tyOperand = poppedTy.value;
  if (!NumericPdfObject.is(tyOperand)) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      message: `Operator '${OPERATOR_NAME}' expected number operand, got ${tyOperand.type}`,
      operatorName: OPERATOR_NAME,
      expected: "number",
      actual: tyOperand.type,
    };
    return err(error);
  }

  const poppedTx = OperandStack.pop(context.operandStack);
  if (!poppedTx.some) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_MISSING",
      message: `Operator '${OPERATOR_NAME}' requires 2 operand(s), got 1`,
      operatorName: OPERATOR_NAME,
      required: 2,
      actual: 1,
    };
    return err(error);
  }
  const txOperand = poppedTx.value;
  if (!NumericPdfObject.is(txOperand)) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      message: `Operator '${OPERATOR_NAME}' expected number operand, got ${txOperand.type}`,
      operatorName: OPERATOR_NAME,
      expected: "number",
      actual: txOperand.type,
    };
    return err(error);
  }

  // TD 固有: leading=-ty（符号反転は leading のみ）と matrix を 1 回の
  // GraphicsState.update で同時反映する。translateLine には反転前の生 ty を渡す。
  const textState = TextState.update(current.textState, {
    leading: -tyOperand.value,
  });
  const textObject = TextObject.translateLine(
    current.textObject,
    txOperand.value,
    tyOperand.value,
  );
  const next = GraphicsState.update(current, { textState, textObject });
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
