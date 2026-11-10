import type { PdfPattern } from "../../document/resources/pattern/index";
import type { PdfOperatorIllegalStateError } from "../../pdf/errors/index";
import { none, type Option, some } from "../../utils/option/index";
import type { ValueOf } from "../../utils/types/utility-type";
import { ColorSpace } from "../graphics-state/color-space/index";

const ColorOperatorNames = {
  Fill: "sc",
  Stroke: "SC",
  FillExtended: "scn",
  StrokeExtended: "SCN",
} as const;

/** 選択した色空間に対する、PDF §8.6の色指定命令。 */
export type ColorOperation = {
  readonly colorSpace: ColorSpace;
  readonly operatorName: ValueOf<typeof ColorOperatorNames>;
};

export const ColorOperation = {
  /**
   * 非着色パターンと基底色空間の組み合わせを検証する。
   * @param operation - 現在の色空間と色指定命令
   * @param pattern - 名前から取得したパターン
   * @returns 着色方式と基底の有無が一致しなければ不正状態のエラー
   */
  patternError(
    operation: ColorOperation,
    pattern: PdfPattern,
  ): Option<PdfOperatorIllegalStateError> {
    const space = operation.colorSpace;
    const hasPatternBase =
      typeof space !== "string" &&
      space.family === "Pattern" &&
      space.base.some;
    if (pattern.patternType === "Unknown") {
      return none;
    }

    const requiresBase = pattern.patternType === 1 && pattern.paintType === 2;
    return hasPatternBase !== requiresBase
      ? some({
          code: "OPERATOR_ILLEGAL_STATE",
          operatorName: operation.operatorName,
          message:
            "Pattern PaintType does not match the selected base color space",
        })
      : none;
  },
  /**
   * 色空間に使用できない色指定命令を検出する。
   * @param operation - 選択中の色空間と実行する命令
   * @returns Patternにsc/SCを使う場合は不正状態のエラー、それ以外はNone
   */
  operatorError(
    operation: ColorOperation,
  ): Option<PdfOperatorIllegalStateError> {
    const isExtended =
      operation.operatorName === ColorOperatorNames.FillExtended ||
      operation.operatorName === ColorOperatorNames.StrokeExtended;
    const isUnsupported =
      ColorSpace.isPattern(operation.colorSpace) && !isExtended;
    return isUnsupported
      ? some({
          code: "OPERATOR_ILLEGAL_STATE",
          operatorName: operation.operatorName,
          message: "Pattern colors require scn or SCN",
        })
      : none;
  },
} as const;
