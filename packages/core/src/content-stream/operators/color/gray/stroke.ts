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

const OPERATOR_NAME = "G";

/**
 * PDF §8.6.5.2 `G gray` operator (DeviceGray stroke color) のハンドラ。
 *
 * operand stack から `gray` 1 個を pop し、`Color.gray(g)` と
 * `ColorSpace.deviceGray()` を生成して GraphicsState の strokeColor /
 * strokeColorSpace を同時更新する。
 *
 * - operand 不足のとき `OPERATOR_OPERAND_MISSING` を返す
 *   `actual` には pop に成功した個数 (= 0) を入れる
 * - operand が integer / real 以外のとき `OPERATOR_OPERAND_TYPE_MISMATCH` を返す
 * - 値域 (`NaN` / `Infinity` / 負値 / >1.0) は本 handler では検証しない
 * - エラー時に operand stack の部分消費は復元しない (既存ハンドラ規約)
 *
 * 実装は cmHandler とテンプレ統一のため `OPERAND_COUNT = 1` でもループ構造を維持する。
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @returns 成功なら更新後コンテキスト、失敗なら PdfError
 */
export const GHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const operandResult = OperandExtractor.popNumber(
    context.operandStack,
    OPERATOR_NAME,
  );
  if (!operandResult.ok) {
    return err(operandResult.error);
  }
  const g = operandResult.value;

  const strokeColor = Color.gray(g);
  const strokeColorSpace = ColorSpace.deviceGray();
  const current = GraphicsStateStack.current(context.graphicsStateStack);
  const next = GraphicsState.update(current, {
    strokeColor,
    strokeColorSpace,
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
