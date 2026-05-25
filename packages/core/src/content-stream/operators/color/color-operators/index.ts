import type { PdfError } from "../../../../pdf/errors/index";
import type { Result } from "../../../../utils/result/index";
import { flatMap, ok } from "../../../../utils/result/index";
import type { OperatorHandler } from "../../../operator-registry/index";
import { OperatorRegistry } from "../../../operator-registry/index";
import { kHandler } from "../cmyk/fill";
import { KHandler } from "../cmyk/stroke";
import { gHandler } from "../gray/fill";
import { GHandler } from "../gray/stroke";
import { rgHandler } from "../rgb/fill";
import { RGHandler } from "../rgb/stroke";

export { kHandler } from "../cmyk/fill";
export { KHandler } from "../cmyk/stroke";
export { gHandler } from "../gray/fill";
export { GHandler } from "../gray/stroke";
export { rgHandler } from "../rgb/fill";
export { RGHandler } from "../rgb/stroke";

const COLOR_OPERATORS: ReadonlyArray<readonly [string, OperatorHandler]> = [
  ["G", GHandler],
  ["g", gHandler],
  ["RG", RGHandler],
  ["rg", rgHandler],
  ["K", KHandler],
  ["k", kHandler],
];

/**
 * Color operator (G / g / RG / rg / K / k) を OperatorRegistry に一括登録するヘルパ。
 *
 * fail-fast: いずれかの register が Err を返した時点で reduce 内 flatMap が
 * 短絡し、後続 operator の register は呼ばれない。
 *
 * @param registry - 登録元 registry
 * @returns 全 operator が登録された新しい registry、または重複登録時の PdfError
 */
export const registerColorOperators = (
  registry: OperatorRegistry,
): Result<OperatorRegistry, PdfError> =>
  COLOR_OPERATORS.reduce<Result<OperatorRegistry, PdfError>>(
    (acc, [name, handler]) =>
      flatMap(acc, (r) => OperatorRegistry.register(r, name, handler)),
    ok(registry),
  );
