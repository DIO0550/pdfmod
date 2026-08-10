import type { PdfError } from "../../../../pdf/errors/index";
import type { Result } from "../../../../utils/result/index";
import { flatMap, ok } from "../../../../utils/result/index";
import type { OperatorHandler } from "../../../operator-registry/index";
import { OperatorRegistry } from "../../../operator-registry/index";
import { cHandler } from "../c";
import { closeFillStrokeHandler } from "../close-fill-stroke";
import { closeFillStrokeEvenOddHandler } from "../close-fill-stroke-even-odd";
import { closeStrokeHandler } from "../close-stroke";
import { endPathHandler } from "../end-path";
import { fillHandler } from "../fill";
import { fillEvenOddHandler } from "../fill-even-odd";
import { fillStrokeHandler } from "../fill-stroke";
import { fillStrokeEvenOddHandler } from "../fill-stroke-even-odd";
import { hHandler } from "../h";
import { lHandler } from "../l";
import { mHandler } from "../m";
import { reHandler } from "../re";
import { strokeHandler } from "../stroke";
import { vHandler } from "../v";
import { yHandler } from "../y";

export { cHandler } from "../c";
export { closeFillStrokeHandler } from "../close-fill-stroke";
export { closeFillStrokeEvenOddHandler } from "../close-fill-stroke-even-odd";
export { closeStrokeHandler } from "../close-stroke";
export { endPathHandler } from "../end-path";
export { fillHandler } from "../fill";
export { fillEvenOddHandler } from "../fill-even-odd";
export { fillStrokeHandler } from "../fill-stroke";
export { fillStrokeEvenOddHandler } from "../fill-stroke-even-odd";
export { hHandler } from "../h";
export { lHandler } from "../l";
export { mHandler } from "../m";
export { reHandler } from "../re";
export { strokeHandler } from "../stroke";
export { vHandler } from "../v";
export { yHandler } from "../y";

const PATH_OPERATORS: ReadonlyArray<readonly [string, OperatorHandler]> = [
  ["m", mHandler],
  ["l", lHandler],
  ["c", cHandler],
  ["v", vHandler],
  ["y", yHandler],
  ["h", hHandler],
  ["re", reHandler],
  ["S", strokeHandler],
  ["s", closeStrokeHandler],
  ["f", fillHandler],
  ["F", fillHandler],
  ["f*", fillEvenOddHandler],
  ["B", fillStrokeHandler],
  ["B*", fillStrokeEvenOddHandler],
  ["b", closeFillStrokeHandler],
  ["b*", closeFillStrokeEvenOddHandler],
  ["n", endPathHandler],
];

/**
 * Path operator (m / l / c / v / y / h / re / S / s / f / F / f* / B / B* /
 * b / b* / n) を OperatorRegistry に一括登録するヘルパ。
 *
 * `F` は `f` の互換 alias (ISO 32000-1:2008 §8.5.3) のため、専用 handler を
 * 作らず `fillHandler` を 2 つの名前で登録する。
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
