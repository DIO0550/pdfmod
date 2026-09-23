import type { OperatorHandler } from "../../../operator-registry/index";
import { createTextStateNumberOperator } from "../text-state-operator-factory/index";

/**
 * PDF §9.3.2 `Tc` operator (character spacing) のハンドラ。
 * operand を 1 個 pop し、number であれば `textState.charSpace` を更新する。
 */
export const tcHandler: OperatorHandler = createTextStateNumberOperator(
  "Tc",
  "charSpace",
);
