/**
 * Brand型・Option/Result モナド・ValueOf などのユーティリティ型および
 * LRUCache などの汎用データ構造を集約するバレル。
 * パッケージ全体で共通利用される汎用ヘルパーを提供する。
 *
 * @module
 */

export type { Brand } from "./brand/index";
export * as Interop from "./interop/index";
export { LRUCache } from "./lru-cache/index";
export * as Option from "./option/index";
export * as Result from "./result/index";
export type { ValueOf } from "./types/utility-type";
