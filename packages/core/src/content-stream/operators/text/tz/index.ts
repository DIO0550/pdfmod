import type { OperatorHandler } from "../../../operator-registry/index";
import { createTextStateNumberOperator } from "../text-state-operator-factory/index";

/**
 * PDF §9.3.4 `Tz scale` operator (horizontal scaling) のハンドラ。
 * operand を 1 個 pop し、number であれば `textState.horizontalScaling` を更新する。
 */
export const tzHandler: OperatorHandler = createTextStateNumberOperator(
  "Tz",
  "horizontalScaling",
);
