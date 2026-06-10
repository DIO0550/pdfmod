import type { PdfError } from "../../../../pdf/errors/index";
import { err, ok } from "../../../../utils/result/index";
import {
  GraphicsState,
  GraphicsStateStack,
  Matrix,
  TextObject,
} from "../../../graphics-state/index";
import { OperandStack } from "../../../operand-stack/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { NumericPdfObject } from "../../graphics-state/numeric-pdf-object/index";

/** PDF 表記を保持した operator 名（"Tm"）。 */
const OPERATOR_NAME = "Tm";

/** Tm が要求する operand 数（a b c d e f）。 */
const OPERAND_COUNT = 6;

/**
 * PDF §9.4.2 `Tm` operator (Set the text matrix and text line matrix) のハンドラ。
 *
 * operand stack から `a b c d e f` の 6 個の数値を pop し、
 * `Matrix.create(a, b, c, d, e, f)` で `textMatrix` / `textLineMatrix` を
 * **絶対上書き**する。`Td` / `TD` の相対移動と異なり、現在の行列を無視して
 * 置換する (`Tm' = Tlm' = matrix`)。`Tm` は BT 〜 ET の内側でのみ有効。
 *
 * 検査順序（厳守）:
 *   (1) active 検査（false なら operand stack を一切消費せず Err）
 *   (2) f → e → d → c → b → a の順に 6 回 pop し、各 pop 後に型検査
 *
 * - text object が active でない場合は `OPERATOR_ILLEGAL_STATE` を返す
 *   （operand stack / graphics state stack は変更しない）
 * - operand 不足 (< 6) のとき `OPERATOR_OPERAND_MISSING` を返す。
 *   `actual` には pop に成功した個数を入れる
 * - operand に integer / real 以外が混在したとき `OPERATOR_OPERAND_TYPE_MISMATCH` を返す
 * - 値域（`NaN` / `Infinity` / 負値 / 小数）は本 handler では検証せずそのまま格納する
 * - エラー時に operand stack の部分消費は復元しない（既存ハンドラ規約）
 * - 成功時 operandStack は同一参照のまま返す（in-place pop 済み）
 *
 * operand 順序: PDF 表記 `a b c d e f Tm` のスタック頂上は f。
 * したがって f → a の順に pop し、reverse して PDF 順 [a, b, c, d, e, f] に戻す。
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const tmHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  if (!TextObject.isActive(current.textObject)) {
    const error: PdfError = {
      code: "OPERATOR_ILLEGAL_STATE",
      message: "Tm: text object is not active (Tm must appear within BT/ET)",
      operatorName: OPERATOR_NAME,
    };
    return err(error);
  }

  const popped: NumericPdfObject[] = [];
  for (let i = 0; i < OPERAND_COUNT; i++) {
    const result = OperandStack.pop(context.operandStack);
    if (!result.some) {
      const error: PdfError = {
        code: "OPERATOR_OPERAND_MISSING",
        message: `Operator '${OPERATOR_NAME}' requires ${OPERAND_COUNT} operand(s), got ${i}`,
        operatorName: OPERATOR_NAME,
        required: OPERAND_COUNT,
        actual: i,
      };
      return err(error);
    }
    const operand = result.value;
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
    popped.push(operand);
  }

  // popped は LIFO 順で [f, e, d, c, b, a]。reverse して PDF 順 [a, b, c, d, e, f] に戻す
  const [a, b, c, d, e, f] = popped
    .slice()
    .reverse()
    .map((operand) => operand.value);

  const operandMatrix = Matrix.create(a, b, c, d, e, f);
  const next = GraphicsState.update(current, {
    textObject: TextObject.setMatrix(current.textObject, operandMatrix),
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    context.graphicsStateStack,
    next,
  );

  return ok({
    operandStack: context.operandStack,
    graphicsStateStack,
  });
};
