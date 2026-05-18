import type { PdfError } from "../../../../pdf/errors/index";
import type { Result } from "../../../../utils/result/index";
import { flatMap, ok } from "../../../../utils/result/index";
import type { OperatorHandler } from "../../../operator-registry/index";
import { OperatorRegistry } from "../../../operator-registry/index";
import { cHandler } from "../c";
import { fillHandler } from "../fill";
import { fillStrokeHandler } from "../fill-stroke";
import { hHandler } from "../h";
import { lHandler } from "../l";
import { mHandler } from "../m";
import { reHandler } from "../re";
import { strokeHandler } from "../stroke";

export { cHandler } from "../c";
export { fillHandler } from "../fill";
export { fillStrokeHandler } from "../fill-stroke";
export { hHandler } from "../h";
export { lHandler } from "../l";
export { mHandler } from "../m";
export { reHandler } from "../re";
export { strokeHandler } from "../stroke";

const PATH_OPERATORS: ReadonlyArray<readonly [string, OperatorHandler]> = [
  ["m", mHandler],
  ["l", lHandler],
  ["c", cHandler],
  ["h", hHandler],
  ["re", reHandler],
  ["S", strokeHandler],
  ["f", fillHandler],
  ["B", fillStrokeHandler],
];

/**
 * Path operator (m / l / c / h / re / S / f / B) を OperatorRegistry に
 * 一括登録するヘルパ。
 *
 * fail-fast: いずれかの register が Err を返した時点で reduce 内 flatMap が
 * 短絡し、後続 operator の register は呼ばれない。
 *
 * @param registry - 登録元 registry
 * @returns 全 operator が登録された新しい registry、または重複登録時の PdfError
 */
export const registerPathOperators = (
  registry: OperatorRegistry,
): Result<OperatorRegistry, PdfError> =>
  PATH_OPERATORS.reduce<Result<OperatorRegistry, PdfError>>(
    (acc, [name, handler]) =>
      flatMap(acc, (r) => OperatorRegistry.register(r, name, handler)),
    ok(registry),
  );
