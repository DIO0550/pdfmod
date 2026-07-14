import type { PdfError } from "../../../../pdf/errors/index";
import type { Result } from "../../../../utils/result/index";
import { flatMap, ok } from "../../../../utils/result/index";
import type { OperatorHandler } from "../../../operator-registry/index";
import { OperatorRegistry } from "../../../operator-registry/index";
import { bdcHandler } from "../bdc/index";
import { bmcHandler } from "../bmc/index";
import { dpHandler } from "../dp/index";
import { emcHandler } from "../emc/index";
import { mpHandler } from "../mp/index";

export { bdcHandler } from "../bdc/index";
export { bmcHandler } from "../bmc/index";
export { dpHandler } from "../dp/index";
export { emcHandler } from "../emc/index";
export { mpHandler } from "../mp/index";

// BMC / EMC / BDC / MP / DP を登録。
// 登録順は既存 fail-fast テスト（marked-content-operators.error.test.ts）が
// ["BMC"] / ["BMC","EMC"] / ["BMC","EMC","BDC"] を pin down しているため、
// この順序を維持する（末尾追加のみ）。
const MARKED_CONTENT_OPERATORS: ReadonlyArray<
  readonly [string, OperatorHandler]
> = [
  ["BMC", bmcHandler],
  ["EMC", emcHandler],
  ["BDC", bdcHandler],
  ["MP", mpHandler],
  ["DP", dpHandler],
];

/**
 * Marked-content operator (BMC / EMC / BDC) を OperatorRegistry に一括登録するヘルパ。
 *
 * fail-fast: いずれかの register が Err を返した時点で reduce 内 flatMap が
 * 短絡し、後続 operator の register は呼ばれない。
 *
 * @param registry - 登録元 registry
 * @returns 全 operator が登録された新しい registry、または重複登録時の PdfError
 */
export const registerMarkedContentOperators = (
  registry: OperatorRegistry,
): Result<OperatorRegistry, PdfError> =>
  MARKED_CONTENT_OPERATORS.reduce<Result<OperatorRegistry, PdfError>>(
    (acc, [name, handler]) =>
      flatMap(acc, (r) => OperatorRegistry.register(r, name, handler)),
    ok(registry),
  );
