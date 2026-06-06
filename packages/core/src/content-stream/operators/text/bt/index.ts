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

/** PDF 表記を保持した operator 名（"BT"）。 */
const OPERATOR_NAME = "BT";

/**
 * PDF §9.4.1 `BT` operator (Begin Text Object) のハンドラ。
 *
 * text object を開始し、current text object を active へ遷移させて
 * textMatrix / textLineMatrix を identity に初期化する (TextObject.begin 経由)。
 * `BT` は引数を取らないため operand stack を pop / 検証 / clear せず
 * 同一参照のまま返す。
 *
 * - operand 数: 0（operand stack を一切消費しない）
 * - current text object が既に active の場合は二重ネスト（nested BT/ET）と
 *   みなし `OPERATOR_ILLEGAL_STATE` を返す。このとき operand stack /
 *   graphics state stack は変更しない。
 * - textObject 以外の graphics state（ctm / textState 等）は変更しない
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 更新後コンテキスト、または二重ネスト時の PdfError
 */
export const btHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  if (TextObject.isActive(current.textObject)) {
    const error: PdfError = {
      code: "OPERATOR_ILLEGAL_STATE",
      message: "BT: text object already active (nested BT/ET is not allowed)",
      operatorName: OPERATOR_NAME,
    };
    return err(error);
  }
  const next = GraphicsState.update(current, {
    textObject: TextObject.begin(),
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
