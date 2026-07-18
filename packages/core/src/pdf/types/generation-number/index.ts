import type { Brand } from "../../../utils/brand/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";

declare const GenerationNumberBrand: unique symbol;

/** 世代番号の許容最大値（ISO 32000-1 §7.5.4 が規定する範囲 0–65535 の上限）。 */
const MAX_GENERATION_NUMBER = 65535;

/**
 * PDF間接オブジェクトの世代番号 (`N G obj` の `G`)。
 * オブジェクト番号（`ObjectNumber`）と組になり `IndirectRef` / `ObjectId` を構成する。
 * 仕様上の許容範囲は 0–65535（ISO 32000-1 §7.5.4）。
 */
type GenerationNumber = Brand<number, typeof GenerationNumberBrand>;

/**
 * `GenerationNumber` の factory utility を束ねた namespace。
 */
const GenerationNumber = {
  /**
   * 数値を検証し、ブランド付き GenerationNumber を Result で返す。
   * ISO 32000-1 §7.5.4 が規定する範囲 0–65535 の整数のみ有効とする。
   *
   * @param n - 検証対象の数値
   * @returns 検証成功時は `ok(GenerationNumber)`、失敗時は `err(エラーメッセージ)`
   */
  create(n: number): Result<GenerationNumber, string> {
    if (!Number.isInteger(n) || n < 0 || n > MAX_GENERATION_NUMBER) {
      return err(
        `Invalid GenerationNumber: ${n} (must be an integer in range 0-${MAX_GENERATION_NUMBER})`,
      );
    }
    return ok(n as GenerationNumber);
  },

  /**
   * 数値を検証なしで GenerationNumber にキャストする。
   * unchecked cast であり、範囲 0–65535 の整数であることの保証は呼び出し側の責務。
   * 未検証の入力（外部データ由来の値など）には `create` を使うこと。
   *
   * @param n - キャスト対象の数値
   * @returns n を GenerationNumber としてキャストした値
   */
  of(n: number): GenerationNumber {
    return n as GenerationNumber;
  },
} as const;

export { GenerationNumber };
