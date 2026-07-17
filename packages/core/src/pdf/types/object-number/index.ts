import { NumberEx } from "../../../ext/number/index";
import type { Brand } from "../../../utils/brand/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";

declare const ObjectNumberBrand: unique symbol;

/**
 * PDF間接オブジェクトのオブジェクト番号 (`N G obj` の `N`)。
 * 世代番号（`GenerationNumber`）と組になり `IndirectRef` / `ObjectId` を構成する。
 */
type ObjectNumber = Brand<number, typeof ObjectNumberBrand>;

/**
 * `ObjectNumber` の factory utility を束ねた namespace。
 */
const ObjectNumber = {
  /**
   * 数値を検証し、ブランド付き ObjectNumber を Result で返す。
   * 0以上の safe integer のみ有効とする。
   *
   * @param n - 検証対象の数値
   * @returns 検証成功時は `ok(ObjectNumber)`、失敗時は `err(エラーメッセージ)`
   */
  create(n: number): Result<ObjectNumber, string> {
    if (!NumberEx.isSafeIntegerAtLeastZero(n)) {
      return err(
        `Invalid ObjectNumber: ${n} (must be a non-negative safe integer)`,
      );
    }
    return ok(n as ObjectNumber);
  },

  /**
   * 数値を検証なしで ObjectNumber にキャストする。
   * unchecked cast であり、0以上の safe integer であることの保証は呼び出し側の責務。
   * 未検証の入力（外部データ由来の値など）には `create` を使うこと。
   *
   * @param n - キャスト対象の数値
   * @returns n を ObjectNumber としてキャストした値
   */
  of(n: number): ObjectNumber {
    return n as ObjectNumber;
  },
} as const;

export { ObjectNumber };
