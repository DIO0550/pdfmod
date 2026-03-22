/**
 * Result型とそのコンビネータ関数群を提供するモジュール。
 * throw禁止のエラーハンドリングを型安全に実現する。
 */
export type { Result, Ok, Err } from "./result.js";
export { ok, err, map, flatMap, mapErr, unwrapOr } from "./result.js";
export { toOption } from "./to-option.js";
