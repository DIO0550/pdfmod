/**
 * 成功を表すResult型。
 * 値を `value` フィールドに保持する。
 *
 * @typeParam T - 成功値の型
 *
 * @example
 * ```ts
 * import { Result } from "@pdfmod/core";
 *
 * const success: Result.Ok<number> = { ok: true, value: 42 };
 * ```
 */
export interface Ok<T> {
  /** 成功を示す判別フラグ */
  readonly ok: true;
  /** 成功値 */
  readonly value: T;
}

/**
 * 失敗を表すResult型。
 * エラー情報を `error` フィールドに保持する。
 *
 * @typeParam E - エラー値の型
 *
 * @example
 * ```ts
 * import { Result } from "@pdfmod/core";
 *
 * const failure: Result.Err<string> = { ok: false, error: "not found" };
 * ```
 */
export interface Err<E> {
  /** 失敗を示す判別フラグ */
  readonly ok: false;
  /** エラー値 */
  readonly error: E;
}

/**
 * 成功または失敗を表す判別共用体型。
 * throw禁止のエラーハンドリングを型安全に実現する。
 *
 * @typeParam T - 成功値の型
 * @typeParam E - エラー値の型
 *
 * @example
 * ```ts
 * import { Result } from "@pdfmod/core";
 *
 * function divide(a: number, b: number): Result.Result<number, string> {
 *   return b === 0 ? Result.err("division by zero") : Result.ok(a / b);
 * }
 * ```
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * 成功Resultを生成する。
 *
 * @typeParam T - 成功値の型
 * @param value - 成功値
 * @returns `Ok<T>` オブジェクト
 *
 * @example
 * ```ts
 * import { Result } from "@pdfmod/core";
 *
 * const result = Result.ok(42);
 * // result = { ok: true, value: 42 }
 * ```
 */
export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

/**
 * 失敗Resultを生成する。
 *
 * @typeParam E - エラー値の型
 * @param error - エラー値
 * @returns `Err<E>` オブジェクト
 *
 * @example
 * ```ts
 * import { Result } from "@pdfmod/core";
 *
 * const result = Result.err("not found");
 * // result = { ok: false, error: "not found" }
 * ```
 */
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

/**
 * 成功値を変換する。
 * Resultが `Ok` の場合のみ変換関数を適用し、`Err` の場合はそのまま返す。
 *
 * @typeParam T - 変換前の成功値の型
 * @typeParam U - 変換後の成功値の型
 * @typeParam E - エラー値の型
 * @param result - 変換対象のResult
 * @param fn - 成功値に適用する変換関数
 * @returns `Ok` の場合は `Ok<U>`、`Err` の場合は元の `Err<E>` をそのまま返す
 *
 * @example
 * ```ts
 * import { Result } from "@pdfmod/core";
 *
 * const r = Result.ok(10);
 * const doubled = Result.map(r, (v) => v * 2);
 * // doubled = { ok: true, value: 20 }
 * ```
 */
export const map = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> => (result.ok ? ok(fn(result.value)) : result);

/**
 * Result返却関数をチェーンする。
 * `Ok` の場合のみ関数を適用し、`Err` の場合はそのまま返す。
 *
 * @typeParam T - 変換前の成功値の型
 * @typeParam U - 変換後の成功値の型
 * @typeParam E - エラー値の型
 * @param result - チェーン対象のResult
 * @param fn - 成功値に適用するResult返却関数
 * @returns `Ok` の場合は `fn` の戻り値、`Err` の場合は元の `Err<E>` をそのまま返す
 *
 * @example
 * ```ts
 * import { Result } from "@pdfmod/core";
 *
 * const r = Result.ok(10);
 * const result = Result.flatMap(r, (v) =>
 *   v > 0 ? Result.ok(v) : Result.err("negative"),
 * );
 * // result = { ok: true, value: 10 }
 * ```
 */
export const flatMap = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> => (result.ok ? fn(result.value) : result);

/**
 * エラー値を変換する（カリー化）。
 * 第一段階で変換関数を受け取り、第二段階で `Result` を受け取る。
 * Resultが `Err` の場合のみ変換関数を適用し、`Ok` の場合はそのまま返す。
 *
 * Rust の `Result::map_err` / fp-ts の `mapLeft` と同じ形式。
 * 呼び出し文脈を知らないバリデータが固有エラーコードを返し、
 * 呼び出し側で文脈別コードへ再ラップするパターンに適している。
 *
 * @typeParam T - 成功値の型
 * @typeParam E - 変換前のエラー値の型
 * @typeParam F - 変換後のエラー値の型
 * @param fn - エラー値に適用する変換関数
 * @returns `Result<T, E>` を受け取り `Result<T, F>` を返す関数
 *
 * @example
 * ```ts
 * import { Result } from "@pdfmod/core";
 *
 * const r = Result.err("not found");
 * const mapped = Result.mapErr((e: string) => new Error(e))(r);
 * // mapped = { ok: false, error: Error("not found") }
 * ```
 */
export const mapErr =
  <E, F>(fn: (error: E) => F) =>
  <T>(result: Result<T, E>): Result<T, F> =>
    result.ok ? result : err(fn(result.error));

/**
 * 成功値を取り出すか、デフォルト値を返す。
 *
 * @typeParam T - 成功値の型
 * @typeParam E - エラー値の型
 * @param result - 対象のResult
 * @param defaultValue - `Err` の場合に返すデフォルト値
 * @returns `Ok` の場合は `value`、`Err` の場合は `defaultValue`
 *
 * @example
 * ```ts
 * import { Result } from "@pdfmod/core";
 *
 * Result.unwrapOr(Result.ok(42), 0);   // 42
 * Result.unwrapOr(Result.err("x"), 0); // 0
 * ```
 */
export const unwrapOr = <T, E>(result: Result<T, E>, defaultValue: T): T =>
  result.ok ? result.value : defaultValue;

export { toOption } from "./to-option/index";
