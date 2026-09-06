import { NumberEx } from "../../../ext/number/index";
import type { Brand } from "../../../utils/brand/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";

declare const FreeObjectNumberBrand: unique symbol;

/**
 * フリーオブジェクトの連結リスト（ISO 32000-1 §7.5.4）が持つリンク値。
 * `XRefFreeEntry.nextFreeObject` として「次の空きオブジェクト番号」を表す。
 *
 * `ObjectNumber` と分けているのは 0 の扱いが違うため。間接オブジェクトの識別子は
 * §7.3.10 により正整数だが、フリーリストのリンク値はリスト末尾で 0（先頭へ戻る）を
 * 指すことが仕様上正しい。両者を同じ型にすると「0 を許すか」の不変条件が
 * 型の中で矛盾するため、リンク値だけを本型に切り出す。
 * 0 は「終端」を意味する正規値であり、それを表す定数は設けない
 * （現時点でフリーリストを走査する実装が無く、命名を先取りしないため）。
 */
type FreeObjectNumber = Brand<number, typeof FreeObjectNumberBrand>;

/**
 * `FreeObjectNumber` の factory utility を束ねた namespace。
 */
const FreeObjectNumber = {
  /**
   * 数値を検証し、ブランド付き FreeObjectNumber を Result で返す。
   * 0以上の safe integer のみ有効とする（0 はリスト終端を表す正規値）。
   *
   * @param n - 検証対象の数値
   * @returns 検証成功時は `ok(FreeObjectNumber)`、失敗時は `err(エラーメッセージ)`
   */
  create(n: number): Result<FreeObjectNumber, string> {
    if (!NumberEx.isSafeIntegerAtLeastZero(n)) {
      return err(
        `Invalid FreeObjectNumber: ${n} (must be a non-negative safe integer)`,
      );
    }
    return ok(n as FreeObjectNumber);
  },

  /**
   * 数値を検証なしで FreeObjectNumber にキャストする。
   * unchecked cast であり、0以上の safe integer（ISO 32000-1 §7.5.4 のリンク値）で
   * あることの保証は呼び出し側の責務。
   * 未検証の入力（外部データ由来の値など）には `create` を使うこと。
   *
   * @param n - キャスト対象の数値
   * @returns n を FreeObjectNumber としてキャストした値
   */
  of(n: number): FreeObjectNumber {
    return n as FreeObjectNumber;
  },
} as const;

export { FreeObjectNumber };
