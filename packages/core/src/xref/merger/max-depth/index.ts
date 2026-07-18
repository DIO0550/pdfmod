import { NumberEx } from "../../../ext/number/index";
import type { PdfParseError } from "../../../pdf/errors/index";
import type { Brand } from "../../../utils/brand/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";

declare const MaxDepthBrand: unique symbol;

/**
 * `mergeXRefChain` の `/Prev` チェーン走査上限。
 * 正の safe integer のみが有効値。生の `number` から `MaxDepth.create` 経由でのみ
 * 生成でき、`XREF_MAX_DEPTH_INVALID` エラー路を型で強制する。
 *
 * @example
 * ```ts
 * const result = MaxDepth.create(50);
 * if (result.ok) {
 *   const depth: MaxDepth = result.value;
 * }
 * ```
 */
export type MaxDepth = Brand<number, typeof MaxDepthBrand>;

// PDF仕様上の明示的な上限はなく、xrefの `/Prev` チェーンの循環参照防止のための防御的な上限値。
const DEFAULT_MAX_PREV_CHAIN_DEPTH = 100;

export const MaxDepth = {
  /** `options.maxDepth` 未指定時に採用される既定値（100）。 */
  DEFAULT: DEFAULT_MAX_PREV_CHAIN_DEPTH as MaxDepth,

  /**
   * ユーザー指定の maxDepth を検証して `MaxDepth` に変換する。
   *
   * - `undefined`（未指定）→ `MaxDepth.DEFAULT` を含む Ok
   * - 正の safe integer → その値を含む Ok
   * - それ以外（0 / 負数 / 非整数 / NaN / ±Infinity / safe integer 超過）→
   *   `XREF_MAX_DEPTH_INVALID` を含む Err
   *
   * @param n - ユーザー指定の maxDepth（未指定可）
   * @returns 検証済み `MaxDepth` を含む Ok、または `XREF_MAX_DEPTH_INVALID` を含む Err
   */
  create(n: number | undefined): Result<MaxDepth, PdfParseError> {
    if (n === undefined) {
      return ok(MaxDepth.DEFAULT);
    }
    if (!NumberEx.isPositiveSafeInteger(n)) {
      return err({
        code: "XREF_MAX_DEPTH_INVALID",
        message: `Invalid options.maxDepth: ${n} (must be a positive safe integer)`,
      });
    }
    return ok(n as MaxDepth);
  },
} as const;
