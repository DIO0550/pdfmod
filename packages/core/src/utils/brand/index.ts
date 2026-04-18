/**
 * 汎用ブランド型ユーティリティ。
 * ベース型 `T` に `__brand` プロパティを intersection して
 * 構造的に異なる型を作る。
 *
 * @typeParam T - ベースとなる型
 * @typeParam B - ブランドを区別するための unique symbol 型
 *
 * @example
 * ```ts
 * declare const MyBrand: unique symbol;
 * type MyId = Brand<number, typeof MyBrand>;
 * const id = 1 as MyId;
 * ```
 */
export type Brand<T, B extends symbol> = T & { readonly __brand: B };
