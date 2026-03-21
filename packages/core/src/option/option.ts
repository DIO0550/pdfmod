import { ok, err } from "../result/result.js";
import type { Result } from "../result/result.js";

/** Some variant - contains a value */
export interface Some<T> {
  readonly some: true;
  readonly value: T;
}

/** None variant - no value */
export interface None {
  readonly some: false;
}

/** Discriminated union option type */
export type Option<T> = Some<T> | None;

/** None singleton (frozen) */
export const none: None = Object.freeze({ some: false as const });

/** Create a Some value (frozen, NonNullable enforced) */
export const some = <T>(value: NonNullable<T>): Some<NonNullable<T>> =>
  Object.freeze({ some: true as const, value });

/** Convert nullable value to Option */
export const fromNullable = <T>(
  value: T | null | undefined,
): Option<NonNullable<T>> =>
  value != null ? some(value as NonNullable<T>) : none;

/** Transform the Some value */
export const map = <T, U>(
  option: Option<T>,
  fn: (value: T) => U,
): Option<NonNullable<U>> =>
  option.some ? fromNullable(fn(option.value)) : none;

/** Chain Option-returning functions */
export const flatMap = <T, U>(
  option: Option<T>,
  fn: (value: T) => Option<U>,
): Option<U> => (option.some ? fn(option.value) : none);

/** Extract value or return default */
export const unwrapOr = <T>(option: Option<T>, defaultValue: T): T =>
  option.some ? option.value : defaultValue;

/** Convert Option to Result */
export const toResult = <T, E>(option: Option<T>, error: E): Result<T, E> =>
  option.some ? ok(option.value) : err(error);

/** Convert Result to Option (error is discarded, nullish Ok values become None) */
export const fromResult = <T, E>(
  result: Result<T, E>,
): Option<NonNullable<T>> =>
  result.ok && result.value != null
    ? some(result.value as NonNullable<T>)
    : none;
