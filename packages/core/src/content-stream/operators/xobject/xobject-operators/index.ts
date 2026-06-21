import type { PdfError } from "../../../../pdf/errors/index";
import type { Result } from "../../../../utils/result/index";
import { flatMap, ok } from "../../../../utils/result/index";
import type { OperatorHandler } from "../../../operator-registry/index";
import { OperatorRegistry } from "../../../operator-registry/index";
import { doHandler } from "../do/index";

export { doHandler } from "../do/index";

// 拡張時はこの配列末尾に追記する（例: ["BI", biHandler], ["ID", idHandler], ["EI", eiHandler]）。
const XOBJECT_OPERATORS: ReadonlyArray<readonly [string, OperatorHandler]> = [
  ["Do", doHandler],
];

/**
 * XObject 描画 operator (Do、将来 BI/ID/EI) を
 * OperatorRegistry に一括登録するヘルパ。
 *
 * fail-fast: いずれかの register が Err を返した時点で reduce 内 flatMap が
 * 短絡し、後続 operator の register は呼ばれない。重複登録時は
 * OPERATOR_ALREADY_REGISTERED の PdfError を Err として伝播する。
 *
 * @param registry - 登録元 registry
 * @returns 全 operator が登録された新しい registry、または重複登録時の PdfError
 */
export const registerXObjectOperators = (
  registry: OperatorRegistry,
): Result<OperatorRegistry, PdfError> =>
  XOBJECT_OPERATORS.reduce<Result<OperatorRegistry, PdfError>>(
    (acc, [name, handler]) =>
      flatMap(acc, (r) => OperatorRegistry.register(r, name, handler)),
    ok(registry),
  );
