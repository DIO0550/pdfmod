/**
 * Option型とそのコンビネータ関数群を提供するモジュール。
 * nullable値を型安全に扱うための抽象化を実現する。
 */
export type { None, Option, Some } from "./option.js";
export {
  flatMap,
  fromNullable,
  fromResult,
  map,
  none,
  some,
  toResult,
  unwrapOr,
} from "./option.js";
