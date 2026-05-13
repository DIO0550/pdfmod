import type { PdfError } from "../../../../pdf/errors/index";
import type { Result } from "../../../../utils/result/index";
import { flatMap, ok } from "../../../../utils/result/index";
import type { OperatorHandler } from "../../../operator-registry/index";
import { OperatorRegistry } from "../../../operator-registry/index";
import { cmHandler } from "../cm";
import { lineCapHandler } from "../line-cap-handler";
import { lineJoinHandler } from "../line-join-handler";
import { lineWidthHandler } from "../line-width-handler";
import { miterLimitHandler } from "../miter-limit-handler";

export { cmHandler } from "../cm";
export { lineCapHandler } from "../line-cap-handler";
export { lineJoinHandler } from "../line-join-handler";
export { lineWidthHandler } from "../line-width-handler";
export { miterLimitHandler } from "../miter-limit-handler";

const GRAPHICS_STATE_OPERATORS: ReadonlyArray<
  readonly [string, OperatorHandler]
> = [
  ["cm", cmHandler],
  ["w", lineWidthHandler],
  ["J", lineCapHandler],
  ["j", lineJoinHandler],
  ["M", miterLimitHandler],
];

/**
 * Graphics State operator (cm / w / J / j / M) を OperatorRegistry に
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
