/**
 * Result型とそのコンビネータ関数群を提供するモジュール。
 * throw禁止のエラーハンドリングを型安全に実現する。
 */
export type { Err, Ok, Result } from "./result";
export { err, flatMap, map, mapErr, ok, unwrapOr } from "./result";
export { toOption } from "./to-option";
