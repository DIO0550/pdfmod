import type { Result } from "./result.js";
import type { Option } from "../option/option.js";
import { some, none } from "../option/option.js";

/** Convert Result to Option (error is discarded, nullish Ok values become None) */
export const toOption = <T, E>(result: Result<T, E>): Option<NonNullable<T>> =>
  result.ok && result.value != null
    ? some(result.value as NonNullable<T>)
    : none;
