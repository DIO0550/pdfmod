import type { PdfError } from "../../../../pdf/errors/index";
import { none, type Option, some } from "../../../../utils/option/index";
import { err, map, ok } from "../../../../utils/result/index";
import { ColorOperation } from "../../../color-operation/index";
import {
  ColorSpaceDefinition,
  ColorSpaceResources,
} from "../../../color-space-resources/index";
import {
  Color,
  ColorSpace,
  GraphicsState,
  GraphicsStateStack,
} from "../../../graphics-state/index";
import { OperandStack } from "../../../operand-stack/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { PaintResources } from "../../../paint-resources/index";
import { ContentStreamResources } from "../../../resources/index";
import { OperandExtractor } from "../../operand-extractor/index";

type ColorTarget = "fill" | "stroke";

/** cs / CS / sc / SC / scn / SCN の色空間に依存する命令。 */
export const ColorSpaceOperators = {
  /**
   * 現在のスコープのリソースを使用するハンドラを作る。
   * @param resources - 解決済みの色空間リソース
   * @param paints - 解決済みのパターンリソース
   * @returns 登録する命令名とハンドラの組
   */
  create(
    resources: ColorSpaceResources = ColorSpaceResources.empty(),
    paints: PaintResources = PaintResources.empty(),
  ): ReadonlyArray<readonly [string, OperatorHandler]> {
    return [
      ["cs", ColorSpaceOperators.select("fill", resources)],
      ["CS", ColorSpaceOperators.select("stroke", resources)],
      ["sc", ColorSpaceOperators.setColor("sc", "fill", paints)],
      ["SC", ColorSpaceOperators.setColor("SC", "stroke", paints)],
      ["scn", ColorSpaceOperators.setColor("scn", "fill", paints)],
      ["SCN", ColorSpaceOperators.setColor("SCN", "stroke", paints)],
    ];
  },

  /**
   * 色空間を選択し、その色空間の初期色へ切り替える。
   * @param target - 塗りまたは輪郭
   * @param resources - コンテキストにスコープがない場合の従来の色空間
   * @returns スコープから取得できなければ、成分数不明の色空間を使うハンドラ
   */
  select(target: ColorTarget, resources: ColorSpaceResources): OperatorHandler {
    return (context) => {
      const operatorName = target === "fill" ? "cs" : "CS";
      const count = ColorSpaceOperators.countError(context, operatorName, 1);
      if (count.some) {
        return err(count.value);
      }

      const name = OperandExtractor.popName(context.operandStack, operatorName);
      if (!name.ok) {
        return name;
      }

      const builtin = ColorSpace.fromName(name.value);
      const scoped = builtin.some
        ? undefined
        : context.resources?.getColorSpace(name.value);
      const missing = (): ColorSpaceDefinition =>
        ColorSpaceDefinition.unresolved(name.value, "COLOR_SPACE_NOT_FOUND");
      const prepared =
        scoped &&
        map(scoped, (value) => (value.some ? value.value : missing()));
      const resolved = builtin.some
        ? ok({ colorSpace: builtin.value, warnings: [] })
        : (prepared ?? resources.spaces.get(name.value) ?? ok(missing()));
      if (!resolved.ok && scoped === undefined) {
        return resolved;
      }

      const definition = resolved.ok ? resolved.value : missing();
      const next = ColorSpaceOperators.update(context, target, {
        color: Color.initial(definition.colorSpace),
        space: definition.colorSpace,
      });
      const warnings = resolved.ok
        ? definition.warnings
        : [
            ContentStreamResources.warning(
              { category: "ColorSpace", name: name.value },
              resolved.error,
            ),
          ];
      return ok({ ...next, warnings });
    };
  },

  /**
   * 現在の色空間の成分数を検証して色値を更新する。
   * @param operatorName - 色指定命令
   * @param target - 塗りまたは輪郭
   * @param resources - コンテキストにスコープがない場合の従来のパターンリソース
   * @returns 個数・型の不一致を Err にするハンドラ
   */
  setColor(
    operatorName: ColorOperation["operatorName"],
    target: ColorTarget,
    resources: PaintResources,
  ): OperatorHandler {
    return (context) => {
      const state = GraphicsStateStack.current(context.graphicsStateStack);
      const space =
        target === "fill" ? state.fillColorSpace : state.strokeColorSpace;
      const operatorError = ColorOperation.operatorError({
        colorSpace: space,
        operatorName,
      });
      if (operatorError.some) {
        return err(operatorError.value);
      }

      const patternName = ColorSpace.isPattern(space)
        ? map(
            OperandExtractor.popName(context.operandStack, operatorName),
            some,
          )
        : ok(none);
      if (!patternName.ok) {
        return patternName;
      }

      const count = ColorSpace.componentCount(space);
      const error = count.some
        ? ColorSpaceOperators.countError(context, operatorName, count.value)
        : none;
      if (error.some) {
        return err(error.value);
      }

      const values = OperandExtractor.popNumbers(
        context.operandStack,
        operatorName,
        count.some ? count.value : OperandStack.depth(context.operandStack),
      );
      if (!values.ok) {
        return values;
      }

      const name = patternName.value;
      const scoped = name.some
        ? context.resources?.getPattern(name.value)
        : undefined;
      const pattern = name.some
        ? (scoped ?? resources.patterns.get(name.value) ?? ok(none))
        : ok(none);
      if (!pattern.ok && scoped === undefined) {
        return pattern;
      }

      const definition = pattern.ok ? pattern.value : none;
      const patternError = definition.some
        ? ColorOperation.patternError(
            { colorSpace: space, operatorName },
            definition.value,
          )
        : none;
      if (patternError.some) {
        return err(patternError.value);
      }

      const next = ColorSpaceOperators.update(context, target, {
        color: Color.fromComponents(space, values.value, name),
        space,
      });
      if (!pattern.ok && name.some) {
        return ok({
          ...next,
          warnings: [
            ContentStreamResources.warning(
              { category: "Pattern", name: name.value },
              pattern.error,
            ),
          ],
        });
      }

      const warnings = definition.some ? definition.value.warnings : [];
      return ok({
        ...next,
        warnings:
          name.some && !definition.some
            ? [
                {
                  code: "PATTERN_NOT_FOUND",
                  message: `Pattern resource not found: /${name.value}`,
                },
              ]
            : warnings,
      });
    };
  },

  /**
   * 色命令のオペランドの過不足を検出する。
   * @param context - 実行コンテキスト
   * @param operatorName - 色命令
   * @param required - 必要な個数
   * @returns 不一致なら個数を含むエラー、一致なら None
   */
  countError(
    context: OperatorHandlerContext,
    operatorName: string,
    required: number,
  ): Option<PdfError> {
    const actual = OperandStack.depth(context.operandStack);
    return actual === required
      ? none
      : some({
          code: "OPERATOR_OPERAND_COUNT_MISMATCH",
          operatorName,
          required,
          actual,
          message: `Operator '${operatorName}' requires ${required} operand(s), got ${actual}`,
        });
  },

  /**
   * 対象の色と色空間だけを更新する。
   * @param context - 更新前の実行コンテキスト
   * @param target - 塗りまたは輪郭
   * @param selection - 選択した色と色空間
   * @returns 更新後の実行コンテキスト
   */
  update(
    context: OperatorHandlerContext,
    target: ColorTarget,
    selection: { readonly color: Color; readonly space: ColorSpace },
  ): OperatorHandlerContext {
    const current = GraphicsStateStack.current(context.graphicsStateStack);
    const next = GraphicsState.update(
      current,
      target === "fill"
        ? { fillColor: selection.color, fillColorSpace: selection.space }
        : { strokeColor: selection.color, strokeColorSpace: selection.space },
    );
    return {
      ...context,
      graphicsStateStack: GraphicsStateStack.replaceCurrent(
        context.graphicsStateStack,
        next,
      ),
    };
  },
} as const;
