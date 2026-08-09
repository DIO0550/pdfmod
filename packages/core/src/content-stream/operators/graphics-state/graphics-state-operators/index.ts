import type { PdfError } from "../../../../pdf/errors/index";
import type { Result } from "../../../../utils/result/index";
import { flatMap, ok } from "../../../../utils/result/index";
import type { OperatorHandler } from "../../../operator-registry/index";
import { OperatorRegistry } from "../../../operator-registry/index";
import { cmHandler } from "../cm";
import { dHandler } from "../d";
import { flatnessHandler } from "../i";
import { lineCapHandler } from "../line-cap-handler";
import { lineJoinHandler } from "../line-join-handler";
import { lineWidthHandler } from "../line-width-handler";
import { miterLimitHandler } from "../miter-limit-handler";
import { qHandler } from "../q";
import { qRestoreHandler } from "../q-restore";
import { riHandler } from "../ri";

export { cmHandler } from "../cm";
export { dHandler } from "../d";
export { flatnessHandler } from "../i";
export { lineCapHandler } from "../line-cap-handler";
export { lineJoinHandler } from "../line-join-handler";
export { lineWidthHandler } from "../line-width-handler";
export { miterLimitHandler } from "../miter-limit-handler";
export { qHandler } from "../q";
export { qRestoreHandler } from "../q-restore";
export { riHandler } from "../ri";

const GRAPHICS_STATE_OPERATORS: ReadonlyArray<
  readonly [string, OperatorHandler]
> = [
  ["cm", cmHandler],
  ["w", lineWidthHandler],
  ["J", lineCapHandler],
  ["j", lineJoinHandler],
  ["M", miterLimitHandler],
  ["d", dHandler],
  ["ri", riHandler],
  ["i", flatnessHandler],
  ["q", qHandler],
  ["Q", qRestoreHandler],
];

/**
 * Graphics State operator (cm / w / J / j / M / d / ri / i / q / Q) を OperatorRegistry に
 * 一括登録するヘルパ。
 *
 * fail-fast: いずれかの register が Err を返した時点で reduce 内 flatMap が
 * 短絡し、後続 operator の register は呼ばれない。
 *
 * @param registry - 登録元 registry
 * @returns 全 operator が登録された新しい registry、または重複登録時の PdfError
 */
export const registerGraphicsStateOperators = (
  registry: OperatorRegistry,
): Result<OperatorRegistry, PdfError> =>
  GRAPHICS_STATE_OPERATORS.reduce<Result<OperatorRegistry, PdfError>>(
    (acc, [name, handler]) =>
      flatMap(acc, (r) => OperatorRegistry.register(r, name, handler)),
    ok(registry),
  );
