import type { Result } from "../result/index";
import { err, ok } from "../result/index";

/**
 * 値が存在することを表すOption型。
 * 値を `value` フィールドに保持する。
 *
 * @typeParam T - 保持する値の型
 *
 * @example
 * ```ts
 * import { Option } from "@pdfmod/core";
 *
 * const s: Option.Some<number> = { some: true, value: 42 };
 * ```
 */
export interface Some<T> {
  /** 値が存在することを示す判別フラグ */
  readonly some: true;
  /** 保持する値 */
  readonly value: T;
}

/**
 * 値が存在しないことを表すOption型。
 *
 * @example
 * ```ts
 * import { Option } from "@pdfmod/core";
 *
 * const n: Option.None = { some: false };
 * ```
 */
export interface None {
  /** 値が存在しないことを示す判別フラグ */
  readonly some: false;
}

/**
 * 値の有無を表す判別共用体型。
 * nullableな値を型安全に扱うために使用する。
 *
 * @typeParam T - 値が存在する場合の型
 *
 * @example
 * ```ts
 * import { Option } from "@pdfmod/core";
 *
 * function find(id: number): Option.Option<string> {
 *   return id === 1 ? Option.some("found") : Option.none;
 * }
 * ```
 */
export type Option<T> = Some<T> | None;

/** map 用の Some 値変換関数型。 */
type Mapper<T, U> = (value: T) => U;

/** flatMap 用の Some 値→Option 変換関数型。 */
type Chainer<T, U> = (value: T) => Option<U>;

/**
 * 値が存在しないことを表すシングルトン（freeze済み）。
 *
 * @example
 * ```ts
 * import { Option } from "@pdfmod/core";
 *
 * const empty: Option.Option<number> = Option.none;
 * // empty = { some: false }
 * ```
 */
export const none: None = Object.freeze({ some: false as const });

/**
 * Someを生成する（freeze済み、NonNullable強制）。
 *
 * @typeParam T - 値の型
 * @param value - 保持する値（null/undefined不可）
 * @returns `Some<NonNullable<T>>` オブジェクト
 *
 * @example
 * ```ts
 * import { Option } from "@pdfmod/core";
 *
 * const s = Option.some(42);
 * // s = { some: true, value: 42 }
 * ```
 */
export const some = <T>(value: NonNullable<T>): Some<NonNullable<T>> =>
  Object.freeze({ some: true as const, value });

/**
 * nullable値をOptionに変換する。
 * 値が非nullishの場合は `Some` を返し、null/undefinedの場合は `None` を返す。
 *
 * @typeParam T - 元の値の型
 * @param value - 変換対象の値
 * @returns 非nullish値の場合は `Some<NonNullable<T>>`、それ以外は `None`
 *
 * @example
 * ```ts
 * import { Option } from "@pdfmod/core";
 *
 * Option.fromNullable(42);        // { some: true, value: 42 }
 * Option.fromNullable(null);      // { some: false }
 * Option.fromNullable(undefined); // { some: false }
 * ```
 */
export const fromNullable = <T>(
  value: T | null | undefined,
): Option<NonNullable<T>> =>
  value != null ? some(value as NonNullable<T>) : none;

/**
 * Some値を変換する。
 * Optionが `Some` の場合のみ変換関数を適用し、`None` の場合はそのまま返す。
 * 変換結果がnullishの場合は `None` になる。
 *
 * @typeParam T - 変換前の値の型
 * @typeParam U - 変換後の値の型
 * @param option - 変換対象のOption
 * @param fn - Some値に適用する変換関数
 * @returns `Some` の場合は変換結果を `fromNullable` で包んだOption、`None` の場合は `None`
 *
 * @example
 * ```ts
 * import { Option } from "@pdfmod/core";
 *
 * Option.map(Option.some(10), (v) => v * 2); // { some: true, value: 20 }
 * Option.map(Option.none, (v) => v * 2);     // { some: false }
 * ```
 */
export const map = <T, U>(
  option: Option<T>,
  fn: Mapper<T, U>,
): Option<NonNullable<U>> =>
  option.some ? fromNullable(fn(option.value)) : none;

/**
 * Option返却関数をチェーンする。
 * `Some` の場合のみ関数を適用し、`None` の場合はそのまま返す。
 *
 * @typeParam T - 変換前の値の型
 * @typeParam U - 変換後の値の型
 * @param option - チェーン対象のOption
 * @param fn - Some値に適用するOption返却関数
 * @returns `Some` の場合は `fn` の戻り値、`None` の場合は `None`
 *
 * @example
 * ```ts
 * import { Option } from "@pdfmod/core";
 *
 * Option.flatMap(Option.some(10), (v) =>
 *   v > 0 ? Option.some(v) : Option.none,
 * ); // { some: true, value: 10 }
 * Option.flatMap(Option.none, (v) => Option.some(v)); // { some: false }
 * ```
 */
export const flatMap = <T, U>(
  option: Option<T>,
  fn: Chainer<T, U>,
): Option<U> => (option.some ? fn(option.value) : none);

/**
 * Some値を取り出すか、デフォルト値を返す。
 *
 * @typeParam T - 値の型
 * @param option - 対象のOption
 * @param defaultValue - `None` の場合に返すデフォルト値
 * @returns `Some` の場合は `value`、`None` の場合は `defaultValue`
 *
 * @example
 * ```ts
 * import { Option } from "@pdfmod/core";
 *
 * Option.unwrapOr(Option.some(42), 0); // 42
 * Option.unwrapOr(Option.none, 0);     // 0
 * ```
 */
export const unwrapOr = <T>(option: Option<T>, defaultValue: T): T =>
  option.some ? option.value : defaultValue;

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
 * import { Option } from "@pdfmod/core";
 *
 * Option.toResult(Option.some(42), "missing");  // { ok: true, value: 42 }
 * Option.toResult(Option.none, "missing");      // { ok: false, error: "missing" }
 * ```
 */
export const toResult = <T, E>(option: Option<T>, error: E): Result<T, E> =>
  option.some ? ok(option.value) : err(error);

/**
 * ResultをOptionに変換する。
 * `Ok` かつ値が非nullishの場合は `Some` を返し、それ以外は `None` を返す。
 * エラー情報は破棄される。
 *
 * @typeParam T - 成功値の型
 * @typeParam E - エラー値の型
 * @param result - 変換対象のResult
 * @returns `Ok` かつ非nullish値の場合は `Some<NonNullable<T>>`、それ以外は `None`
 *
 * @see {@link import("../result/index").toOption} — Result モジュール側の同等関数
 *
 * @example
 * ```ts
 * import { Option, Result } from "@pdfmod/core";
 *
 * Option.fromResult(Result.ok(42));        // { some: true, value: 42 }
 * Option.fromResult(Result.err("error"));  // { some: false }
 * ```
 */
export const fromResult = <T, E>(
  result: Result<T, E>,
): Option<NonNullable<T>> =>
  result.ok && result.value != null
    ? some(result.value as NonNullable<T>)
    : none;
