/** Success result */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Failure result */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Discriminated union result type */
export type Result<T, E> = Ok<T> | Err<E>;

/** Create a success result */
export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

/** Create a failure result */
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

/** Transform the ok value */
export const map = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> => (result.ok ? ok(fn(result.value)) : result);

/** Chain Result-returning functions */
export const flatMap = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> => (result.ok ? fn(result.value) : result);

/** Transform the error value */
export const mapErr = <T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F,
): Result<T, F> => (result.ok ? result : err(fn(result.error)));

/** Extract value or return default */
export const unwrapOr = <T, E>(result: Result<T, E>, defaultValue: T): T =>
  result.ok ? result.value : defaultValue;
