import type { OperatorHandler } from "../../../operator-registry/index";
import { createTextStateNumberOperator } from "../text-state-operator-factory/index";

/**
 * PDF §9.3.5 `TL` operator (text leading) のハンドラ。
 * operand を 1 個 pop し、number であれば `textState.leading` を更新する。
 */
export const tlHandler: OperatorHandler = createTextStateNumberOperator(
  "TL",
  "leading",
);
