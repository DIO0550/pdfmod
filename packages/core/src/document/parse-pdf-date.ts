/**
 * `D:YYYY[MM[DD[HH[mm[SS]]]]][TZ]` 形式の PDF 日時文字列の各成分を保持する。
 *
 * - month: 1-12（PDF 仕様準拠、`Date` の 0-11 オフセットは適用前）
 * - day:   1-31
 * - hour:  0-23 / min: 0-59 / sec: 0-59
 * - tzSign: `"+"` / `"-"` / `"Z"` / 省略時 `undefined`
 * - tzHour / tzMin: `tzSign` が `"+"` または `"-"` のときのみ意味を持つ
 */
interface ParsedDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly min: number;
  readonly sec: number;
  readonly tzSign: "+" | "-" | "Z" | undefined;
  readonly tzHour: number;
  readonly tzMin: number;
}

const PREFIX_LENGTH = 2;
const YEAR_LENGTH = 4;

/**
 * `"D:..."` 文字列を {@link ParsedDateParts} に分解し各成分を範囲検証する。
 *
 * 構造検証は Step 15 で `DATE_PATTERN` 正規表現に統一される。
 *
 * @param raw - PDF 日時文字列
 * @returns 構造・範囲が妥当な場合 `ParsedDateParts`、不正な場合 `undefined`
 */
const extractDateParts = (raw: string): ParsedDateParts | undefined => {
  const body = raw.slice(PREFIX_LENGTH);
  if (body.length < YEAR_LENGTH) {
    return undefined;
  }
  const yearStr = body.slice(0, YEAR_LENGTH);
  if (!/^\d{4}$/.test(yearStr)) {
    return undefined;
  }
  const year = Number(yearStr);
  return {
    year,
    month: 1,
    day: 1,
    hour: 0,
    min: 0,
    sec: 0,
    tzSign: undefined,
    tzHour: 0,
    tzMin: 0,
  };
};

/**
 * PDF 日時文字列 `"D:YYYY[MM[DD[HH[mm[SS]]]]][TZ]"` を {@link Date} にパースする。
 *
 * 警告 push は本関数では行わず、戻り値が `undefined` のとき呼び出し側で
 * `DATE_PARSE_FAILED` 警告を push する設計（pure 関数）。
 *
 * @param raw - PDF 日時文字列
 * @returns 成功時は `Date`、構文・範囲・不在日いずれかで失敗した場合は `undefined`
 */
export const parsePdfDate = (raw: string): Date | undefined => {
  if (!raw.startsWith("D:")) {
    return undefined;
  }
  const parsed = extractDateParts(raw);
  if (parsed === undefined) {
    return undefined;
  }
  return new Date(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    parsed.hour,
    parsed.min,
    parsed.sec,
  );
};
