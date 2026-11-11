import type { PdfError } from "../../../../pdf/errors/index";
import type { Result } from "../../../../utils/result/index";
import { flatMap, ok } from "../../../../utils/result/index";
import { ColorSpaceResources } from "../../../color-space-resources/index";
import type { OperatorHandler } from "../../../operator-registry/index";
import { OperatorRegistry } from "../../../operator-registry/index";
import { PaintResources } from "../../../paint-resources/index";
import { kHandler } from "../cmyk/fill";
import { KHandler } from "../cmyk/stroke";
import { gHandler } from "../gray/fill";
import { GHandler } from "../gray/stroke";
import { rgHandler } from "../rgb/fill";
import { RGHandler } from "../rgb/stroke";
import { ColorSpaceOperators } from "../selection/index";

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
 * デバイス色・色空間選択・成分指定の命令を一括登録する。
 *
 * fail-fast: いずれかの register が Err を返した時点で reduce 内 flatMap が
 * 短絡し、後続 operator の register は呼ばれない。
 *
 * @param registry - 登録元 registry
 * @param colorSpaces - 実行対象スコープの解決済み色空間
 * @param paints - 実行対象スコープのパターンリソース
 * @returns 全 operator が登録された新しい registry、または重複登録時の PdfError
 */
export const registerColorOperators = (
  registry: OperatorRegistry,
  colorSpaces: ColorSpaceResources = ColorSpaceResources.empty(),
  paints: PaintResources = PaintResources.empty(),
): Result<OperatorRegistry, PdfError> =>
  [
    ...COLOR_OPERATORS,
    ...ColorSpaceOperators.create(colorSpaces, paints),
  ].reduce<Result<OperatorRegistry, PdfError>>(
    (acc, [name, handler]) =>
      flatMap(acc, (r) => OperatorRegistry.register(r, name, handler)),
    ok(registry),
  );
