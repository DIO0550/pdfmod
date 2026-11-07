import { none } from "../../../../utils/option/index";
import { ok } from "../../../../utils/result/index";
import { ExtGState, ExtGStateResources } from "../../../ext-gstate/index";
import { GraphicsStateStack } from "../../../graphics-state/index";
import type { OperatorHandler } from "../../../operator-registry/index";
import { OperandExtractor } from "../../operand-extractor/index";

/** gs ハンドラを、解決済みのリソーススコープに束縛する。 */
export const GsOperator = {
  /**
   * 名前オペランドから拡張状態を適用するハンドラを生成する。
   * @param resources - 実行対象スコープの解決済み拡張状態
   * @returns 不在は警告して状態を保持し、参照解決エラーは Err にするハンドラ
   */
  create(
    resources: ExtGStateResources = ExtGStateResources.empty(),
  ): OperatorHandler {
    return (context) => {
      const name = OperandExtractor.popName(context.operandStack, "gs");
      if (!name.ok) {
        return name;
      }

      const resolved = resources.states.get(name.value) ?? ok(none);
      if (!resolved.ok) {
        return resolved;
      }

      const extended = resolved.value;
      if (!extended.some) {
        return ok({
          ...context,
          warnings: [
            {
              code: "EXT_GSTATE_NOT_FOUND",
              message: `ExtGState not found: /${name.value}`,
            },
          ],
        });
      }

      const current = GraphicsStateStack.current(context.graphicsStateStack);
      const next = ExtGState.apply(current, extended.value);
      return ok({
        ...context,
        graphicsStateStack: GraphicsStateStack.replaceCurrent(
          context.graphicsStateStack,
          next,
        ),
        warnings: extended.value.warnings,
      });
    };
  },
} as const;
