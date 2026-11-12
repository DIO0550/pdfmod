import { none } from "../../../../utils/option/index";
import { ok } from "../../../../utils/result/index";
import { ExtGState, ExtGStateResources } from "../../../ext-gstate/index";
import { GraphicsStateStack } from "../../../graphics-state/index";
import type { OperatorHandler } from "../../../operator-registry/index";
import { ContentStreamResources } from "../../../resources/index";
import { OperandExtractor } from "../../operand-extractor/index";

/** gs ハンドラを作り、実行コンテキストから拡張状態を引く。 */
export const GsOperator = {
  /**
   * 名前オペランドから拡張状態を適用するハンドラを生成する。
   * @param resources - コンテキストにスコープがない場合の従来の拡張状態
   * @returns スコープから取得できなければ警告して状態を保持するハンドラ
   */
  create(
    resources: ExtGStateResources = ExtGStateResources.empty(),
  ): OperatorHandler {
    return (context) => {
      const name = OperandExtractor.popName(context.operandStack, "gs");
      if (!name.ok) {
        return name;
      }

      const scoped = context.resources?.getExtGState(name.value);
      const resolved = scoped ?? resources.states.get(name.value) ?? ok(none);
      if (!resolved.ok && scoped === undefined) {
        return resolved;
      }

      if (!resolved.ok) {
        return ok({
          ...context,
          warnings: [
            ContentStreamResources.warning(
              { category: "ExtGState", name: name.value },
              resolved.error,
            ),
          ],
        });
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
