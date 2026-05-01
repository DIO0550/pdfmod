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

const XREF_OFFSET_DIGITS = 10;
const DECIMAL_RADIX = 10;

/**
 * 10 桁ゼロ埋めでオフセットを表現する。xref テーブルの 18 バイト本体規約に従う。
 *
 * @param n - 0 以上の整数オフセット値
 * @returns 10 桁ゼロ埋め文字列
 */
const padOffset10 = (n: number): string =>
  n.toString(DECIMAL_RADIX).padStart(XREF_OFFSET_DIGITS, "0");

/**
 * 1 ページのみを持つ最小構成の PDF を生成する。
 *
 * Catalog (1 0 obj) / Pages (2 0 obj) / Page (3 0 obj, MediaBox=[0 0 612 792])
 * を持つ最小 PDF (テキスト xref) を組み立てる。
 *
 * @returns 1 ページの最小 PDF を表すバイト列
 */
export const buildMinimalSinglePagePdf = (): Uint8Array => {
  const encoder = new TextEncoder();

  const header = "%PDF-1.7\n";
  const obj1 = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  const obj2 = "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n";
  const obj3 =
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n";

  const offset1 = encoder.encode(header).length;
  const offset2 = offset1 + encoder.encode(obj1).length;
  const offset3 = offset2 + encoder.encode(obj2).length;
  const xrefOffset = offset3 + encoder.encode(obj3).length;

  const xref =
    "xref\n" +
    "0 4\n" +
    "0000000000 65535 f \n" +
    `${padOffset10(offset1)} 00000 n \n` +
    `${padOffset10(offset2)} 00000 n \n` +
    `${padOffset10(offset3)} 00000 n \n`;
  const trailer =
    "trailer\n<< /Size 4 /Root 1 0 R >>\n" +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return encoder.encode(header + obj1 + obj2 + obj3 + xref + trailer);
};

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
