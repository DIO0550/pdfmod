/**
 * Result型とそのコンビネータ関数群を提供するモジュール。
 * throw禁止のエラーハンドリングを型安全に実現する。
 */
export type { Err, Ok, Result } from "./result/index";
export { err, flatMap, map, mapErr, ok, unwrapOr } from "./result/index";
export { toOption } from "./to-option/index";
