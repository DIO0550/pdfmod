import { none } from "../../../../utils/option/index";
import { err, ok } from "../../../../utils/result/index";
import { OperandStack } from "../../../operand-stack/index";
import type { OperatorHandler } from "../../../operator-registry/index";
import { PaintResources } from "../../../paint-resources/index";
import { ContentStreamResources } from "../../../resources/index";
import { OperandExtractor } from "../../operand-extractor/index";

/** sh は名前から定義を取得する。描画と関数評価は後段が担う。 */
export const ShOperator = {
  /**
   * 現在のスコープのシェーディングを使用するハンドラを作る。
   * @param resources - コンテキストにスコープがない場合の従来の描画リソース
   * @returns 個数・型の不一致は Err、スコープから取得できない場合は警告
   */
  create(resources: PaintResources = PaintResources.empty()): OperatorHandler {
    return (context) => {
      const actual = OperandStack.depth(context.operandStack);
      if (actual !== 1) {
        return err({
          code: "OPERATOR_OPERAND_COUNT_MISMATCH",
          operatorName: "sh",
          required: 1,
          actual,
          message: `Operator 'sh' requires 1 operand, got ${actual}`,
        });
      }

      const name = OperandExtractor.popName(context.operandStack, "sh");
      if (!name.ok) {
        return name;
      }

      const scoped = context.resources?.getShading(name.value);
      const shading = scoped ?? resources.shadings.get(name.value) ?? ok(none);
      if (!shading.ok && scoped === undefined) {
        return shading;
      }

      if (!shading.ok) {
        return ok({
          ...context,
          warnings: [
            ContentStreamResources.warning(
              { category: "Shading", name: name.value },
              shading.error,
            ),
          ],
        });
      }

      return ok({
        ...context,
        warnings: shading.value.some
          ? shading.value.value.warnings
          : [
              {
                code: "SHADING_NOT_FOUND",
                message: `Shading resource not found: /${name.value}`,
              },
            ],
      });
    };
  },
} as const;
