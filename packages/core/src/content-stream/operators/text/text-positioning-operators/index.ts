import type { PdfError } from "../../../../pdf/errors/index";
import type { Result } from "../../../../utils/result/index";
import { flatMap, ok } from "../../../../utils/result/index";
import type { OperatorHandler } from "../../../operator-registry/index";
import { OperatorRegistry } from "../../../operator-registry/index";
import { tStarHandler } from "../t-star/index";
import { tdHandler } from "../td/index";
import { tdLeadingHandler } from "../td-leading/index";
import { tmHandler } from "../tm/index";

export { tStarHandler } from "../t-star/index";
export { tdHandler } from "../td/index";
export { tdLeadingHandler } from "../td-leading/index";
export { tmHandler } from "../tm/index";

// 登録順は Issue 指定順（Td, TD, Tm, T*）。
// この順序は error テストの fail-fast 呼び出し順検証に直結する。
const TEXT_POSITIONING_OPERATORS: ReadonlyArray<
  readonly [string, OperatorHandler]
> = [
  ["Td", tdHandler],
  ["TD", tdLeadingHandler],
  ["Tm", tmHandler],
  ["T*", tStarHandler],
];

/**
 * Text positioning operator (Td / TD / Tm / T*) を
 * OperatorRegistry に一括登録するヘルパ。
 *
 * fail-fast: いずれかの register が Err を返した時点で reduce 内 flatMap が
 * 短絡し、後続 operator の register は呼ばれない。
 *
 * @param registry - 登録元 registry
 * @returns 全 operator が登録された新しい registry、または重複登録時の PdfError
 */
export const registerTextPositioningOperators = (
  registry: OperatorRegistry,
): Result<OperatorRegistry, PdfError> =>
  TEXT_POSITIONING_OPERATORS.reduce<Result<OperatorRegistry, PdfError>>(
    (acc, [name, handler]) =>
      flatMap(acc, (r) => OperatorRegistry.register(r, name, handler)),
    ok(registry),
  );
