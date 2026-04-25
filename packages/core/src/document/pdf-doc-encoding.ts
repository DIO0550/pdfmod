import type { PdfWarning } from "../pdf/errors/warning/index";

/**
 * 未割当バイト検出時に出力する Unicode 置換文字 (U+FFFD)。
 */
export const REPLACEMENT_CHAR = "�";

/** PDFDocEncoding テーブルのエントリ数（1 バイト = 256 値）。 */
const TABLE_SIZE = 256;

/** ASCII / 制御文字をそのまま U+0000..U+007F にマップする領域の上端。 */
const PASSTHROUGH_END = 0x7f;

/** 8 文字のダイアクリティカル領域の開始バイト (˘)。 */
const DIACRITIC_START = 0x18;

/**
 * ISO 32000-1 Annex D.2 の 0x18..0x1F に割り当てられた 8 個のダイアクリティカル文字。
 * U+0018..U+001F の制御コードではなく U+02C6..U+02DD にマップされる。
 */
const DIACRITIC_CHARS: readonly string[] = [
  "˘",
  "ˇ",
  "ˆ",
  "˙",
  "˝",
  "˛",
  "˚",
  "˜",
];

/** 上位特殊文字領域 (bullet 〜 ž) の開始バイト。 */
const UPPER_SPECIAL_START = 0x80;

/**
 * ISO 32000-1 Annex D.2 の 0x80..0x9E 領域に並ぶ特殊記号 (bullet, dagger, em dash, OE 等)。
 * 0x9F は未割当（テーブル上 `undefined`）なので末尾には含めない。
 */
const UPPER_SPECIAL_CHARS: readonly string[] = [
  "•",
  "†",
  "‡",
  "…",
  "—",
  "–",
  "ƒ",
  "⁄",
  "‹",
  "›",
  "−",
  "‰",
  "„",
  "“",
  "”",
  "‘",
  "’",
  "‚",
  "™",
  "ﬁ",
  "ﬂ",
  "Ł",
  "Œ",
  "Š",
  "Ÿ",
  "Ž",
  "ı",
  "ł",
  "œ",
  "š",
  "ž",
];

/** 0xA0 は EURO SIGN に再マップされる (Latin-1 の NBSP ではない)。 */
const EURO_BYTE = 0xa0;

/** Latin-1 (U+00A1..U+00FF) と一致する領域の下端 (0xAD は未割当)。 */
const LATIN1_START = 0xa1;

/** Latin-1 補助領域の上端。 */
const LATIN1_END = 0xff;

/** PDFDocEncoding で未割当のバイト位置 (Latin-1 の SOFT HYPHEN 0xAD に相当)。 */
const UNASSIGNED_LATIN1_HOLE = 0xad;

/**
 * 256 エントリの PDFDocEncoding テーブルを構築する。
 *
 * @returns 各 byte に対応する Unicode 文字。未割当バイトは `undefined`。
 */
const buildTable = (): ReadonlyArray<string | undefined> => {
  const table: (string | undefined)[] = Array.from({ length: TABLE_SIZE });
  for (let i = 0; i <= PASSTHROUGH_END; i++) {
    table[i] = String.fromCharCode(i);
  }
  for (let i = 0; i < DIACRITIC_CHARS.length; i++) {
    table[DIACRITIC_START + i] = DIACRITIC_CHARS[i];
  }
  for (let i = 0; i < UPPER_SPECIAL_CHARS.length; i++) {
    table[UPPER_SPECIAL_START + i] = UPPER_SPECIAL_CHARS[i];
  }
  table[EURO_BYTE] = "€";
  for (let i = LATIN1_START; i <= LATIN1_END; i++) {
    if (i === UNASSIGNED_LATIN1_HOLE) {
      continue;
    }
    table[i] = String.fromCharCode(i);
  }
  return table;
};

/**
 * ISO 32000-1 Annex D.2 (Table D.2) で定義される PDFDocEncoding テーブル。
 *
 * 256 エントリの配列で、各 byte (0x00..0xFF) に対応する Unicode 文字を保持する。
 * 未割当のバイトは `undefined`。
 */
export const PDF_DOC_ENCODING: ReadonlyArray<string | undefined> = buildTable();

/**
 * PDFDocEncoding バイト列を JavaScript 文字列にデコードする。
 *
 * @param bytes - 入力バイト列
 * @param fieldName - エラーメッセージに含めるフィールド名 (`Title` 等)
 * @param warnings - 警告蓄積先（mutable）
 * @returns デコード結果文字列（未割当バイト混入時も常に string）
 */
export const decodePdfDocEncoding = (
  bytes: Uint8Array,
  _fieldName: string,
  _warnings: PdfWarning[],
): string => {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const ch = PDF_DOC_ENCODING[bytes[i]];
    if (ch === undefined) {
      out += REPLACEMENT_CHAR;
      continue;
    }
    out += ch;
  }
  return out;
};
