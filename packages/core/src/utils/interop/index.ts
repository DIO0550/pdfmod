import type { Option } from "../option/index";
import { none, some } from "../option/index";
import type { Result } from "../result/index";
import { err, ok } from "../result/index";

/**
 * ResultをOptionに変換する。
 * `Ok` の場合は `Some` を返し、`Err` の場合は `None` を返す（エラー情報は破棄される）。
 * 成功値の型 `T` は非nullishに制約され、`Result<T | null, E>` 等を渡すとコンパイルエラーになる。
 *
 * @typeParam T - 成功値の型（null / undefined を含む型は不可）
 * @typeParam E - エラー値の型
 * @param result - 変換対象のResult
 * @returns `Ok` の場合は `Some<T>`、`Err` の場合は `None`
 *
 * @example
 * ```ts
 * import { Interop, Result } from "@pdfmod/core";
 *
 * Interop.toOption(Result.ok(42));        // { some: true, value: 42 }
 * Interop.toOption(Result.err("error"));  // { some: false }
 * ```
 */
export const toOption = <T extends NonNullable<unknown>, E>(
  result: Result<T, E>,
): Option<T> => (result.ok ? some(result.value) : none);

/**
 * OptionをResultに変換する。
 * `Some` の場合は `Ok` を返し、`None` の場合は指定されたエラー値で `Err` を返す。
 *
 * @typeParam T - 値の型
 * @typeParam E - エラー値の型
 * @param option - 変換対象のOption
 * @param error - `None` の場合に使用するエラー値
 * @returns `Some` の場合は `Ok<T>`、`None` の場合は `Err<E>`
 *
 * @example
 * ```ts
 * import { Interop, Option } from "@pdfmod/core";
 *
 * Interop.toResult(Option.some(42), "missing"); // { ok: true, value: 42 }
 * Interop.toResult(Option.none, "missing");     // { ok: false, error: "missing" }
 * ```
 */
export const toResult = <T, E>(option: Option<T>, error: E): Result<T, E> =>
  option.some ? ok(option.value) : err(error);
