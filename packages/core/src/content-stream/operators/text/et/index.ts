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

/** PDF 表記を保持した operator 名（"ET"）。 */
const OPERATOR_NAME = "ET";

/**
 * PDF §9.4.1 `ET` operator (End Text Object) のハンドラ。
 *
 * 現在の text object を終了し、current text object を inactive へ戻して
 * textMatrix / textLineMatrix を identity にリセットする (TextObject.end 経由)。
 * `ET` は引数を取らないため operand stack を pop / 検証 / clear せず
 * 同一参照のまま返す。
 *
 * - operand 数: 0（operand stack を一切消費しない）
 * - current text object が active でない場合は対応する BT が無い
 *   （ET without BT）とみなし `OPERATOR_ILLEGAL_STATE` を返す。このとき
 *   operand stack / graphics state stack は変更しない。
 * - textObject 以外の graphics state（ctm / textState 等）は変更しない
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 更新後コンテキスト、または BT 不在時の PdfError
 */
export const etHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  if (!TextObject.isActive(current.textObject)) {
    const error: PdfError = {
      code: "OPERATOR_ILLEGAL_STATE",
      message: "ET: no active text object (ET without BT)",
      operatorName: OPERATOR_NAME,
    };
    return err(error);
  }
  const next = GraphicsState.update(current, {
    textObject: TextObject.end(current.textObject),
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
