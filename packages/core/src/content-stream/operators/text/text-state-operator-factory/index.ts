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

/**
 * TextState の特定数値プロパティを更新するオペレータハンドラを生成するファクトリ。
 *
 * `Tc`（charSpace）、`Tw`（wordSpace）、`Tz`（horizontalScaling）、
 * `TL`（leading）、`Ts`（rise）のように、オペランドスタックから数値 1 個を取得して
 * TextState の該当フィールドを更新する定型ハンドラを生成する。
 *
 * @param operatorName - エラーメッセージ用のオペレータ識別名
 * @param field - 更新対象の TextState 数値プロパティ名
 * @returns OperatorHandler 関数
 */
export function createTextStateNumberOperator(
  operatorName: string,
  field: "charSpace" | "wordSpace" | "horizontalScaling" | "leading" | "rise",
): OperatorHandler {
  return (context: OperatorHandlerContext) => {
    const result = OperandExtractor.popNumber(
      context.operandStack,
      operatorName,
    );
    if (!result.ok) {
      return err(result.error);
    }
    const current = GraphicsStateStack.current(context.graphicsStateStack);
    const nextTextState = TextState.update(current.textState, {
      [field]: result.value,
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
}
