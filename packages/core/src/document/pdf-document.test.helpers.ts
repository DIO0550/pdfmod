/**
 * `PdfDocument.load` の振る舞いテストで使う最小限の PDF バイト列ビルダー群。
 *
 * 本ファイルは PR-1 (skeleton) 時点では関数本体は空 (`new Uint8Array()`) であり、
 * PR-2 以降の Red/Green サイクルで段階的に本実装に差し替えていく。
 *
 * 方針 A (overview.md §5.1.1): error / boundary テストで `result.error.code`
 * を読む際は `assert(!(result.error instanceof RangeError));` で narrowing する。
 * 本ファイルには narrowing 用 helper (`expectPdfError` 等) は置かない。
 */

/**
 * `/Info` 由来のメタデータフィールド。
 * `buildSinglePagePdfWithInfo` に渡す入力構造を表す。
 */
export interface InfoFields {
  readonly title?: string;
  readonly author?: string;
}

/**
 * 1 ページのみを持つ最小構成の PDF を生成する。
 *
 * @returns 1 ページの最小 PDF を表すバイト列
 */
export const buildMinimalSinglePagePdf = (): Uint8Array => new Uint8Array();

/**
 * 1 ページ + `/Info` 辞書を持つ PDF を生成する。
 *
 * @param _info - `/Info` に格納するフィールド
 * @returns `/Info` 付き PDF を表すバイト列
 */
export const buildSinglePagePdfWithInfo = (_info: InfoFields): Uint8Array =>
  new Uint8Array();

/**
 * 2 ページの PDF を生成する。
 *
 * @returns 2 ページ PDF を表すバイト列
 */
export const buildTwoPagePdf = (): Uint8Array => new Uint8Array();

/**
 * `/Catalog` を欠く不正な PDF を生成する。
 *
 * @returns `/Catalog` 不在の PDF を表すバイト列
 */
export const buildPdfWithoutCatalog = (): Uint8Array => new Uint8Array();

/**
 * `/MediaBox` を欠く不正な PDF を生成する。
 *
 * @returns `/MediaBox` 不在の PDF を表すバイト列
 */
export const buildPdfWithoutMediaBox = (): Uint8Array => new Uint8Array();

/**
 * `startxref` の値が壊れた PDF を生成する。
 *
 * @returns `startxref` 破損 PDF を表すバイト列
 */
export const buildPdfWithCorruptStartXRef = (): Uint8Array => new Uint8Array();

/**
 * xref が破損し、かつ trailer も復元できない PDF を生成する。
 *
 * @returns xref/trailer ともに破損した PDF を表すバイト列
 */
export const buildPdfWithCorruptXRefAndNoTrailer = (): Uint8Array =>
  new Uint8Array();

/**
 * ヘッダのみで本体を持たない PDF を生成する。
 *
 * @returns ヘッダのみの PDF を表すバイト列
 */
export const buildPdfHeaderOnly = (): Uint8Array => new Uint8Array();

/**
 * `/Info` の参照が壊れた PDF を生成する。
 *
 * @returns `/Info` 参照不正の PDF を表すバイト列
 */
export const buildPdfWithInvalidInfoRef = (): Uint8Array => new Uint8Array();

/**
 * インクリメンタルアップデートを含む PDF を生成する。
 *
 * @returns インクリメンタルアップデート付き PDF を表すバイト列
 */
export const buildPdfWithIncrementalUpdate = (): Uint8Array => new Uint8Array();
