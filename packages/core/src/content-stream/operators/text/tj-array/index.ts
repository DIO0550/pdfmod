import type { PdfError } from "../../../../pdf/errors/index";
import { err, ok } from "../../../../utils/result/index";
import {
  GraphicsState,
  GraphicsStateStack,
  TextObject,
} from "../../../graphics-state/index";
import { OperandStack } from "../../../operand-stack/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { NumericPdfObject } from "../../graphics-state/numeric-pdf-object/index";

/** PDF 表記を保持した operator 名（"TJ"）。 */
const OPERATOR_NAME = "TJ";

/**
 * PDF §9.4.3 / §6.5 `TJ` operator (show a text array with positioning) のハンドラ。
 * 配列を 1 個 pop し、要素を先頭から走査する。
 *
 * 検査順序（厳守）:
 *   (1) active 検査（false なら `OPERATOR_ILLEGAL_STATE`）
 *   (2) operand pop（none なら `OPERATOR_OPERAND_MISSING`）
 *   (3) top-level 型検査（type !== "array" なら `OPERATOR_OPERAND_TYPE_MISMATCH`）
 *   (4) 要素走査（string / integer / real 以外なら `OPERATOR_OPERAND_TYPE_MISMATCH`）
 *
 * 数値要素 n は textMatrix を
 * `translate(-n/1000 × fontSize × (hScale/100), 0) × Tm`
 * で更新する。textLineMatrix は変更しない。`offset === 0` の場合は
 * `translateText` を呼ばずに次の要素へ進み、graphicsStateStack の同一参照を保つ。
 *
 * 本フェーズでは string の描画 / glyph advance は非スコープ。string 要素は
 * 受理してそのまま次の要素へ進む。
 *
 * 部分適用ポリシー（代替案 A）: 要素走査中に許可されない型を検出した場合は
 * commit せず即 `err` を返す。よって配列要素 type-mismatch 時の
 * `graphicsStateStack` は同一参照のままとなる。
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const tjArrayHandler: OperatorHandler = (
  context: OperatorHandlerContext,
) => {
  const current = GraphicsStateStack.current(context.graphicsStateStack);

  if (!TextObject.isActive(current.textObject)) {
    const error: PdfError = {
      code: "OPERATOR_ILLEGAL_STATE",
      message: "TJ: text object is not active (TJ must appear within BT/ET)",
      operatorName: OPERATOR_NAME,
    };
    return err(error);
  }

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
  if (operand.type !== "array") {
    const error: PdfError = {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      message: `Operator '${OPERATOR_NAME}' expected array operand, got ${operand.type}`,
      operatorName: OPERATOR_NAME,
      expected: "array",
      actual: operand.type,
    };
    return err(error);
  }

  const { fontSize, horizontalScaling } = current.textState;
  let textObject = current.textObject;

  for (const element of operand.elements) {
    if (element.type === "string") {
      continue;
    }
    if (NumericPdfObject.is(element)) {
      const offset =
        (-element.value / 1000) * fontSize * (horizontalScaling / 100);
      if (offset === 0) {
        continue;
      }
      textObject = TextObject.translateText(textObject, offset, 0);
      continue;
    }
    const error: PdfError = {
      code: "OPERATOR_OPERAND_TYPE_MISMATCH",
      message:
        `Operator '${OPERATOR_NAME}' expected string|integer|real array element, ` +
        `got ${element.type}`,
      operatorName: OPERATOR_NAME,
      expected: "string|integer|real",
      actual: element.type,
    };
    return err(error);
  }

  if (textObject === current.textObject) {
    return ok({
      operandStack: context.operandStack,
      graphicsStateStack: context.graphicsStateStack,
    });
  }

  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    context.graphicsStateStack,
    GraphicsState.update(current, { textObject }),
  );

  return ok({
    operandStack: context.operandStack,
    graphicsStateStack,
  });
};
