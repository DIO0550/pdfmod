/**
 * Brand型ユーティリティと PDF 数値型エイリアス
 *
 * 素の number 型では区別できないオブジェクト番号・世代番号・バイトオフセットを
 * コンパイル時に型レベルで区別するための Branded Type パターンを提供する。
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used only as type brand via typeof
declare const ObjectNumberBrand: unique symbol;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used only as type brand via typeof
declare const GenerationNumberBrand: unique symbol;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used only as type brand via typeof
declare const ByteOffsetBrand: unique symbol;

/**
 * 汎用ブランド型ユーティリティ。
 * ベース型 `T` に `__brand` プロパティを intersection して
 * 構造的に異なる型を作る。
 *
 * @typeParam T - ベースとなる型
 * @typeParam B - ブランドを区別するための unique symbol 型
 */
export type Brand<T, B extends symbol> = T & { readonly __brand: B };

/**
 * PDF オブジェクト番号 (ISO 32000 7.3.10)。
 * 正の整数。間接オブジェクトを一意に識別する。
 */
export type ObjectNumber = Brand<number, typeof ObjectNumberBrand>;

/**
 * PDF オブジェクト世代番号 (ISO 32000 7.3.10)。
 * 0〜65535 の範囲の整数。オブジェクトの更新世代を示す。
 */
export type GenerationNumber = Brand<number, typeof GenerationNumberBrand>;

/**
 * ファイル内バイトオフセット。
 * PDF ファイル先頭からのバイト位置を示す非負整数。
 */
export type ByteOffset = Brand<number, typeof ByteOffsetBrand>;
