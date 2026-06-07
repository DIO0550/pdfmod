import type { PdfError } from "../../../../pdf/errors/index";
import type { Result } from "../../../../utils/result/index";
import { flatMap, ok } from "../../../../utils/result/index";
import type { OperatorHandler } from "../../../operator-registry/index";
import { OperatorRegistry } from "../../../operator-registry/index";
import { btHandler } from "../bt/index";
import { etHandler } from "../et/index";
import { tcHandler } from "../tc/index";
import { tfHandler } from "../tf/index";
import { tlHandler } from "../tl/index";
import { trHandler } from "../tr/index";
import { tsHandler } from "../ts/index";
import { twHandler } from "../tw/index";
import { tzHandler } from "../tz/index";

export { btHandler } from "../bt/index";
export { etHandler } from "../et/index";
export { tcHandler } from "../tc/index";
export { tfHandler } from "../tf/index";
export { tlHandler } from "../tl/index";
export { trHandler } from "../tr/index";
export { tsHandler } from "../ts/index";
export { twHandler } from "../tw/index";
export { tzHandler } from "../tz/index";

// 登録順は Issue 指定順（BT, ET, Tf, Tc, Tw, Tz, TL, Tr, Ts）。
// この順序は error テストの fail-fast 呼び出し順検証に直結する。
const TEXT_STATE_OPERATORS: ReadonlyArray<readonly [string, OperatorHandler]> =
  [
    ["BT", btHandler],
    ["ET", etHandler],
    ["Tf", tfHandler],
    ["Tc", tcHandler],
    ["Tw", twHandler],
    ["Tz", tzHandler],
    ["TL", tlHandler],
    ["Tr", trHandler],
    ["Ts", tsHandler],
  ];

/**
 * Text state operator (BT / ET / Tf / Tc / Tw / Tz / TL / Tr / Ts) を
 * OperatorRegistry に一括登録するヘルパ。
 *
 * fail-fast: いずれかの register が Err を返した時点で reduce 内 flatMap が
 * 短絡し、後続 operator の register は呼ばれない。
 *
 * @param registry - 登録元 registry
 * @returns 全 operator が登録された新しい registry、または重複登録時の PdfError
 */
export const registerTextStateOperators = (
  registry: OperatorRegistry,
): Result<OperatorRegistry, PdfError> =>
  TEXT_STATE_OPERATORS.reduce<Result<OperatorRegistry, PdfError>>(
    (acc, [name, handler]) =>
      flatMap(acc, (r) => OperatorRegistry.register(r, name, handler)),
    ok(registry),
  );
