import type { PdfError } from "../../../../pdf/errors/index";
import { err, ok } from "../../../../utils/result/index";
import {
  GraphicsState,
  GraphicsStateStack,
  TextObject,
} from "../../../graphics-state/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { OperandExtractor } from "../../operand-extractor/index";

/** PDF 表記を保持した operator 名（"Td"）。 */
const OPERATOR_NAME = "Td";

/**
 * PDF §9.4.2 `Td` operator (Move to the start of the next line) のハンドラ。
 *
 * operand stack から `tx ty` を pop し、`Tlm' = translate(tx, ty) × Tlm`、
 * `Tm' = Tlm'` を `TextObject.translateLine` で計算して GraphicsState の
 * textObject を更新する。`Td` は BT 〜 ET の内側でのみ有効。
 *
 * 検査順序（厳守）:
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
 * - エラー時に operand stack の部分消費は復元しない（既存ハンドラ規約）
 *
 * operand 順序: PDF 表記 `tx ty Td` のスタック頂上は ty。
 * したがって ty を先に pop、tx を後に pop する。
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const tdHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  if (!TextObject.isActive(current.textObject)) {
    const error: PdfError = {
      code: "OPERATOR_ILLEGAL_STATE",
      message: "Td: text object is not active (Td must appear within BT/ET)",
      operatorName: OPERATOR_NAME,
    };
    return err(error);
  }

  const operandsResult = OperandExtractor.popNumbers(
    context.operandStack,
    OPERATOR_NAME,
    2,
  );
  if (!operandsResult.ok) {
    return err(operandsResult.error);
  }
  const [tx, ty] = operandsResult.value;

  const next = GraphicsState.update(current, {
    textObject: TextObject.translateLine(current.textObject, tx, ty),
  });
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
