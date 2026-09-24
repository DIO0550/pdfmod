import { err, ok } from "../../../../utils/result/index";
import {
  Color,
  ColorSpace,
  GraphicsState,
  GraphicsStateStack,
} from "../../../graphics-state/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { OperandExtractor } from "../../operand-extractor/index";

const OPERATOR_NAME = "rg";
const OPERAND_COUNT = 3;

/**
 * PDF §8.6.5.3 `rg r g b` operator (DeviceRGB fill color) のハンドラ。
 *
 * operand stack から `r g b` 3 個を pop し、`Color.rgb(r, g, b)` と
 * `ColorSpace.deviceRGB()` を生成して GraphicsState の fillColor /
 * fillColorSpace を同時更新する。strokeColor / strokeColorSpace は変更しない。
 *
 * - operand 不足のとき `OPERATOR_OPERAND_MISSING` を返す
 *   `actual` には pop に成功した個数 (= 0, 1, 2) を入れる
 * - operand が integer / real 以外のとき `OPERATOR_OPERAND_TYPE_MISMATCH` を返す
 * - 値域 (`NaN` / `Infinity` / 負値 / >1.0) は本 handler では検証しない
 * - エラー時に operand stack の部分消費は復元しない (既存ハンドラ規約)
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const rgHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const operandsResult = OperandExtractor.popNumbers(
    context.operandStack,
    OPERATOR_NAME,
    OPERAND_COUNT,
  );
  if (!operandsResult.ok) {
    return err(operandsResult.error);
  }
  const [r, g, b] = operandsResult.value;

  const fillColor = Color.rgb(r, g, b);
  const fillColorSpace = ColorSpace.deviceRGB();
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const next = GraphicsState.update(current, {
    fillColor,
    fillColorSpace,
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
