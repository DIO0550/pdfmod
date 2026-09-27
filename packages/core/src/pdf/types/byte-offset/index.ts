import { NumberEx } from "../../../ext/number/index";
import type { Brand } from "../../../utils/brand/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";

declare const ByteOffsetBrand: unique symbol;

/**
 * PDFファイル先頭からのバイトオフセット。
 * 相互参照テーブルのエントリ（`XRefUsedEntry.offset`）やトレーラの `/Prev` など、
 * ファイル内の物理位置を示す値に使う。
 */
type ByteOffset = Brand<number, typeof ByteOffsetBrand>;

/**
 * `ByteOffset` の factory / 演算 utility を束ねた namespace。
 */
const ByteOffset = {
  /**
   * 数値を検証し、ブランド付き ByteOffset を Result で返す。
   * 0以上の safe integer のみ有効とする。
   *
   * @param n - 検証対象の数値
   * @returns 検証成功時は `ok(ByteOffset)`、失敗時は `err(エラーメッセージ)`
   */
  create(n: number): Result<ByteOffset, string> {
    if (!NumberEx.isSafeIntegerAtLeastZero(n)) {
      return err(
        `Invalid ByteOffset: ${n} (must be a non-negative safe integer)`,
      );
    }
    return ok(n as ByteOffset);
  },

  /**
   * 数値を検証なしで ByteOffset にキャストする。
   *
   * 呼び出し側で 0 以上の safe integer であることが検証済み・確定しているコンテキスト
   * （定数 0、バッファ走査位置、検証済みオフセット同士の加算など）に限って使用する。
   * 外部入力や未検証の数値には `create` を使うこと。無検証キャストのため、
   * 不正な値を渡しても実行時エラーにならず不正な状態が型境界をすり抜ける。
   *
   * @param n - 呼び出し側で 0 以上の safe integer であることが保証された数値
   * @returns n を ByteOffset としてキャストした値
   */
  of(n: number): ByteOffset {
    return n as ByteOffset;
  },

  /**
   * 2つの ByteOffset を加算する。
   *
   * @param a - 加算対象の ByteOffset
   * @param b - 加算対象の ByteOffset
   * @returns a と b を加算した ByteOffset
   */
  add(a: ByteOffset, b: ByteOffset): ByteOffset {
    return ((a as number) + (b as number)) as ByteOffset;
  },
} as const;

export { ByteOffset };
