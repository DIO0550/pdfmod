import type { PdfError } from "../../../../pdf/errors/index";
import type { Result } from "../../../../utils/result/index";
import { flatMap, ok } from "../../../../utils/result/index";
import type { OperatorHandler } from "../../../operator-registry/index";
import { OperatorRegistry } from "../../../operator-registry/index";
import { apostropheHandler } from "../apostrophe/index";
import { quoteHandler } from "../quote/index";
import { tjHandler } from "../tj/index";
import { tjArrayHandler } from "../tj-array/index";

export { apostropheHandler } from "../apostrophe/index";
export { quoteHandler } from "../quote/index";
export { tjHandler } from "../tj/index";
export { tjArrayHandler } from "../tj-array/index";

// 登録順は Issue 指定順（Tj, TJ, ', "）。
// この順序は error テストの fail-fast 呼び出し順検証に直結する。
const TEXT_SHOWING_OPERATORS: ReadonlyArray<
  readonly [string, OperatorHandler]
> = [
  ["Tj", tjHandler],
  ["TJ", tjArrayHandler],
  ["'", apostropheHandler],
  ['"', quoteHandler],
];

/**
 * Text showing operator (Tj / TJ / ' / ") を
 * OperatorRegistry に一括登録するヘルパ。
 *
 * fail-fast: いずれかの register が Err を返した時点で reduce 内 flatMap が
 * 短絡し、後続 operator の register は呼ばれない。
 *
 * @param registry - 登録元 registry
 * @returns 全 operator が登録された新しい registry、または重複登録時の PdfError
 */
export const registerTextShowingOperators = (
  registry: OperatorRegistry,
): Result<OperatorRegistry, PdfError> =>
  TEXT_SHOWING_OPERATORS.reduce<Result<OperatorRegistry, PdfError>>(
    (acc, [name, handler]) =>
      flatMap(acc, (r) => OperatorRegistry.register(r, name, handler)),
    ok(registry),
  );
