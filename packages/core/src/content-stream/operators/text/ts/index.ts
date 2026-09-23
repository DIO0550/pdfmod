import type { OperatorHandler } from "../../../operator-registry/index";
import { createTextStateNumberOperator } from "../text-state-operator-factory/index";

/**
 * PDF §9.3.7 `Ts` operator (text rise) のハンドラ。
 * operand を 1 個 pop し、number であれば `textState.rise` を更新する。
 */
export const tsHandler: OperatorHandler = createTextStateNumberOperator(
  "Ts",
  "rise",
);
