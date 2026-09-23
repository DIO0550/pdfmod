import type { OperatorHandler } from "../../../operator-registry/index";
import { createTextStateNumberOperator } from "../text-state-operator-factory/index";

/**
 * PDF §9.3.3 `Tw` operator (word spacing) のハンドラ。
 * operand を 1 個 pop し、number であれば `textState.wordSpace` を更新する。
 */
export const twHandler: OperatorHandler = createTextStateNumberOperator(
  "Tw",
  "wordSpace",
);
