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

/** PDF 表記を保持した operator 名（'"'）。 */
const OPERATOR_NAME = '"';
/** PDF §9.4.3 `"` の operand 個数 (aw, ac, string)。 */
const OPERAND_COUNT = 3;

/**
 * PDF §9.4.3 `"` (quote / set word & character spacing, move to next line,
 * show text) operator のハンドラ。
 *
 * `aw ac string "` は `aw Tw ac Tc string '` と等価。current の
 * `textState.leading` を参照し、`TextState.update({ wordSpace, charSpace })`
 * で spacing を更新したうえで、`TextObject.translateLine(textObject, 0,
 * -leading)` でテキスト行列を次行頭へ移動し、string operand を受理する。
 *
 * operand 順序（stack pop 順）: string → ac → aw
 *
 * 検査順序（厳守。段階的 pop & 型検査交互パターン）:
 *   (1) active 検査（false なら `OPERATOR_ILLEGAL_STATE` を返す）
 *   (2-a) string pop（none なら `OPERATOR_OPERAND_MISSING` actual=0）
 *   (3-a) string 型検査（type !== "string" なら `OPERATOR_OPERAND_TYPE_MISMATCH`
 *         expected: "string"）
 *   (2-b) ac pop（none なら `OPERATOR_OPERAND_MISSING` actual=1）
 *   (3-b) ac 型検査（!NumericPdfObject.is なら `OPERATOR_OPERAND_TYPE_MISMATCH`
 *         expected: "number"）
 *   (2-c) aw pop（none なら `OPERATOR_OPERAND_MISSING` actual=2）
 *   (3-c) aw 型検査（!NumericPdfObject.is なら `OPERATOR_OPERAND_TYPE_MISMATCH`
 *         expected: "number"）
 *   (4) state 更新（1 回の GraphicsState.update +
 *       1 回の GraphicsStateStack.replaceCurrent）
 *
 * - text object が active でない場合は `OPERATOR_ILLEGAL_STATE` を返す
 *   （operand stack / graphics state stack は変更しない）
 * - operand 不足のとき `OPERATOR_OPERAND_MISSING` を返す
 *   （graphics state stack は変更しない。部分消費した operand stack は
 *   復元しない — 既存ハンドラ規約）
 * - 型不一致のときも部分消費した operand stack は復元しない
 * - `aw` / `ac` / `leading` の値域（負値 / `NaN` / `Infinity`）は本 handler
 *   では検証しない（apostrophe / Tc / Tw / T* と同一規約）
 * - フォント幅辞書が未実装のため、本フェーズでは描画後の advance 計算と
 *   glyph 描画は行わない（イベント機構自体が未導入のため、string operand は
 *   consume するだけで観測可能な副作用は spacing 更新と行送り以外に発生しない。
 *   tjHandler / apostropheHandler と同一規約）
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const quoteHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => {
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  if (!TextObject.isActive(current.textObject)) {
    const error: PdfError = {
      code: "OPERATOR_ILLEGAL_STATE",
      message: '": text object is not active (" must appear within BT/ET)',
      operatorName: OPERATOR_NAME,
    };
    return err(error);
  }

  const poppedString = OperandStack.pop(context.operandStack);
  if (!poppedString.some) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_MISSING",
      message: `Operator '${OPERATOR_NAME}' requires ${OPERAND_COUNT} operand(s), got 0`,
      operatorName: OPERATOR_NAME,
      required: OPERAND_COUNT,
      actual: 0,
    };
    return err(error);
  }

  const stringOperand = poppedString.value;
  if (stringOperand.type !== "string") {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      message: `Operator '${OPERATOR_NAME}' expected string operand, got ${stringOperand.type}`,
      operatorName: OPERATOR_NAME,
      expected: "string",
      actual: stringOperand.type,
    };
    return err(error);
  }

  const poppedAc = OperandStack.pop(context.operandStack);
  if (!poppedAc.some) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_MISSING",
      message: `Operator '${OPERATOR_NAME}' requires ${OPERAND_COUNT} operand(s), got 1`,
      operatorName: OPERATOR_NAME,
      required: OPERAND_COUNT,
      actual: 1,
    };
    return err(error);
  }

  const acOperand = poppedAc.value;
  if (!NumericPdfObject.is(acOperand)) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      message: `Operator '${OPERATOR_NAME}' expected number operand, got ${acOperand.type}`,
      operatorName: OPERATOR_NAME,
      expected: "number",
      actual: acOperand.type,
    };
    return err(error);
  }

  const poppedAw = OperandStack.pop(context.operandStack);
  if (!poppedAw.some) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_MISSING",
      message: `Operator '${OPERATOR_NAME}' requires ${OPERAND_COUNT} operand(s), got 2`,
      operatorName: OPERATOR_NAME,
      required: OPERAND_COUNT,
      actual: 2,
    };
    return err(error);
  }

  const awOperand = poppedAw.value;
  if (!NumericPdfObject.is(awOperand)) {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      message: `Operator '${OPERATOR_NAME}' expected number operand, got ${awOperand.type}`,
      operatorName: OPERATOR_NAME,
      expected: "number",
      actual: awOperand.type,
    };
    return err(error);
  }

  // state 更新（TD パターン: 1 回の GraphicsState.update で textState と textObject を atomic 反映）
  // leading は TextState.update を呼ぶ前に保持する（Tc/Tw は leading を変えないが規約として徹底）。
  const leading = current.textState.leading;
  const textState = TextState.update(current.textState, {
    wordSpace: awOperand.value,
    charSpace: acOperand.value,
  });
  const textObject = TextObject.translateLine(current.textObject, 0, -leading);
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
