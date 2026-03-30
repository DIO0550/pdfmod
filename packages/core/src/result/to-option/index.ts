import type { Option } from "../../option/index";
import { none, some } from "../../option/index";
import type { Result } from "../index";

/**
 * ResultをOptionに変換する。
 * `Ok` かつ値が非nullish の場合は `Some` を返し、それ以外は `None` を返す。
 * エラー情報は破棄される。
 *
 * @typeParam T - 成功値の型
 * @typeParam E - エラー値の型
 * @param result - 変換対象のResult
 * @returns `Ok` かつ非nullish値の場合は `Some<NonNullable<T>>`、それ以外は `None`
 *
 * @see {@link import("../../option/index").fromResult} — Option モジュール側の同等関数
 *
 * @example
 * ```ts
 * import { Result } from "@pdfmod/core";
 *
 * Result.toOption(Result.ok(42));        // { some: true, value: 42 }
 * Result.toOption(Result.err("error"));  // { some: false }
 * Result.toOption(Result.ok(null));      // { some: false }
 * ```
 */
export const toOption = <T, E>(result: Result<T, E>): Option<NonNullable<T>> =>
  result.ok && result.value != null
    ? some(result.value as NonNullable<T>)
    : none;
