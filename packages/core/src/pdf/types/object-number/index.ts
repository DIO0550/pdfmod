import { NumberEx } from "../../../ext/number/index";
import type { Brand } from "../../../utils/brand/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";

declare const ObjectNumberBrand: unique symbol;

/**
 * PDF間接オブジェクトのオブジェクト番号 (`N G obj` の `N`)。
 * 世代番号（`GenerationNumber`）と組になり `IndirectRef` / `ObjectId` を構成する。
 *
 * ISO 32000-1 §7.3.10 は間接オブジェクトの識別子を「positive integer object number」と
 * 規定するため、本型が表すのは **1 以上**の safe integer に限る。
 * §7.5.4 のフリーリストが持つ 0（リスト先頭の予約番号 / リンク値）は本型では表現できない。
 * その用途には `FreeObjectNumber` を使うこと。
 */
type ObjectNumber = Brand<number, typeof ObjectNumberBrand>;

/**
 * `ObjectNumber` の factory utility を束ねた namespace。
 */
const ObjectNumber = {
  /**
   * 数値を検証し、ブランド付き ObjectNumber を Result で返す。
   * ISO 32000-1 §7.3.10 に従い、1 以上の safe integer のみ有効とする。
   * 0 は `FreeObjectNumber` の担当であり、本型では受理しない。
   *
   * @param n - 検証対象の数値
   * @returns 検証成功時は `ok(ObjectNumber)`、失敗時は `err(エラーメッセージ)`
   */
  create(n: number): Result<ObjectNumber, string> {
    if (!NumberEx.isPositiveSafeInteger(n)) {
      return err(
        `Invalid ObjectNumber: ${n} (must be a positive safe integer)`,
      );
    }
    return ok(n as ObjectNumber);
  },

  /**
   * 数値を検証なしで ObjectNumber にキャストする。
   * unchecked cast であり、正の safe integer（ISO 32000-1 §7.3.10）であることの保証は
   * 呼び出し側の責務。0 を渡す必要がある場合は `FreeObjectNumber` を使うこと。
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
