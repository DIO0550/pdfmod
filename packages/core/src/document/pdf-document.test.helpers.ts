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

const PDF_HEADER = "%PDF-1.7\n";
const CATALOG_BODY = "<< /Type /Catalog /Pages 2 0 R >>";
const PAGES_BODY_SINGLE = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
const PAGES_BODY_TWO = "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>";
const PAGE_BODY = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>";

/**
 * 10 桁ゼロ埋めでオフセットを表現する。xref テーブルの 20 バイト本体規約に従う。
 *
 * @param n - 0 以上の整数オフセット値
 * @returns 10 桁ゼロ埋め文字列
 */
const padOffset10 = (n: number): string =>
  n.toString(DECIMAL_RADIX).padStart(XREF_OFFSET_DIGITS, "0");

const ASCII_MAX = 0x7f;
const HEX_BYTE_DIGITS = 2;
const HEX_RADIX = 16;
const UTF16_HIGH_BYTE_SHIFT = 8;
const BYTE_MASK = 0xff;
const UTF16_BE_BOM_HEX = "feff";

/**
 * 入力文字列が ASCII (U+0000〜U+007F) のみで構成されているかを判定する。
 *
 * @param s - 判定対象の文字列
 * @returns すべて ASCII なら true
 */
const isAscii = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > ASCII_MAX) {
      return false;
    }
  }
  return true;
};

/**
 * 文字列を UTF-16BE BOM 付き hex string `<feff...>` 形式へエンコードする。
 * PDF の string object として非 ASCII 文字を扱う標準的な表現。
 *
 * @param s - エンコード対象の文字列
 * @returns hex string 表記
 */
const toUtf16BeHexString = (s: string): string => {
  const hexParts: string[] = [UTF16_BE_BOM_HEX];
  for (let i = 0; i < s.length; i++) {
    const cu = s.charCodeAt(i);
    const high = (cu >> UTF16_HIGH_BYTE_SHIFT) & BYTE_MASK;
    const low = cu & BYTE_MASK;
    hexParts.push(
      high.toString(HEX_RADIX).padStart(HEX_BYTE_DIGITS, "0"),
      low.toString(HEX_RADIX).padStart(HEX_BYTE_DIGITS, "0"),
    );
  }
  return `<${hexParts.join("")}>`;
};

/**
 * 任意の文字列を PDF の string object 表記へエンコードする。
 * - 入力が ASCII のみ: literal string `(...)`（`\\` `(` `)` のみエスケープ）
 * - 非 ASCII を含む: UTF-16BE BOM 付き hex string `<feff...>`
 *
 * いずれの形式も `decodePdfString` 側で復号可能。
 *
 * @param s - エンコード対象の文字列
 * @returns PDF string object 表記
 */
const toPdfString = (s: string): string => {
  if (!isAscii(s)) {
    return toUtf16BeHexString(s);
  }
  const escaped = s.replace(/[\\()]/g, (c) => `\\${c}`);
  return `(${escaped})`;
};

/**
 * 1 0 obj 〜 N 0 obj の本体配列と trailer 補助エントリを与え、
 * テキスト xref 形式の PDF バイト列を組み立てる。
 *
 * @param objectBodies - 各オブジェクトの本体（`<< ... >>` 等）
 * @param trailerExtras - trailer 辞書に追記するエントリ（先頭スペース込み）。例: `" /Info 4 0 R"`
 * @returns 組み立てた PDF バイト列
 */
const assembleTextPdf = (
  objectBodies: readonly string[],
  trailerExtras = "",
): Uint8Array => {
  const encoder = new TextEncoder();
  const objs = objectBodies.map(
    (body, i) => `${i + 1} 0 obj\n${body}\nendobj\n`,
  );

  const offsets: number[] = [];
  let cursor = encoder.encode(PDF_HEADER).length;
  for (const obj of objs) {
    offsets.push(cursor);
    cursor += encoder.encode(obj).length;
  }
  const xrefOffset = cursor;

  const size = objectBodies.length + 1;
  const xrefRows = [
    "0000000000 65535 f \n",
    ...offsets.map((o) => `${padOffset10(o)} 00000 n \n`),
  ];
  const xref = `xref\n0 ${size}\n${xrefRows.join("")}`;
  const trailer = `trailer\n<< /Size ${size} /Root 1 0 R${trailerExtras} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return encoder.encode(PDF_HEADER + objs.join("") + xref + trailer);
};

/**
 * 1 ページのみを持つ最小構成の PDF を生成する。
 *
 * Catalog (1 0 obj) / Pages (2 0 obj) / Page (3 0 obj, MediaBox=[0 0 612 792])
 * を持つ最小 PDF (テキスト xref) を組み立てる。
 *
 * @returns 1 ページの最小 PDF を表すバイト列
 */
export const buildMinimalSinglePagePdf = (): Uint8Array =>
  assembleTextPdf([CATALOG_BODY, PAGES_BODY_SINGLE, PAGE_BODY]);

/**
 * 1 ページ + `/Info` 辞書を持つ PDF を生成する。
 * `/Info` には `info` で指定された Title / Author のみ収録する。
 *
 * @param info - `/Info` に格納するフィールド
 * @returns `/Info` 付き PDF を表すバイト列
 */
export const buildSinglePagePdfWithInfo = (info: InfoFields): Uint8Array => {
  const fields: string[] = [];
  if (info.title !== undefined) {
    fields.push(`/Title ${toPdfString(info.title)}`);
  }
  if (info.author !== undefined) {
    fields.push(`/Author ${toPdfString(info.author)}`);
  }
  const infoBody = `<< ${fields.join(" ")} >>`;
  return assembleTextPdf(
    [CATALOG_BODY, PAGES_BODY_SINGLE, PAGE_BODY, infoBody],
    " /Info 4 0 R",
  );
};

/**
 * 2 ページの PDF を生成する。
 *
 * Catalog (1 0 obj) / Pages (2 0 obj, /Count 2) / Page1 (3 0 obj) / Page2 (4 0 obj)
 * の 4 オブジェクト構成。
 *
 * @returns 2 ページ PDF を表すバイト列
 */
export const buildTwoPagePdf = (): Uint8Array =>
  assembleTextPdf([CATALOG_BODY, PAGES_BODY_TWO, PAGE_BODY, PAGE_BODY]);

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
