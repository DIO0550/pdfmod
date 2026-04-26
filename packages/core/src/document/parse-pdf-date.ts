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

const STRUCT_PATTERN =
  /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:(Z)|([+-])(\d{2})'(\d{2})')?$/;

const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = 60_000;

/**
 * `"D:..."` 文字列を {@link ParsedDateParts} に分解し各成分を範囲検証する。
 *
 * 構造検証は Step 15 で TZ も含む `DATE_PATTERN` 正規表現に拡張される。
 *
 * @param raw - PDF 日時文字列
 * @returns 構造・範囲が妥当な場合 `ParsedDateParts`、不正な場合 `undefined`
 */
const extractDateParts = (raw: string): ParsedDateParts | undefined => {
  const match = STRUCT_PATTERN.exec(raw);
  if (!match) {
    return undefined;
  }
  const [
    ,
    yearStr,
    monthStr,
    dayStr,
    hourStr,
    minStr,
    secStr,
    zStr,
    signStr,
    tzHourStr,
    tzMinStr,
  ] = match;
  const year = Number(yearStr);
  let month = 1;
  if (monthStr !== undefined) {
    month = Number(monthStr);
  }
  let day = 1;
  if (dayStr !== undefined) {
    day = Number(dayStr);
  }
  let hour = 0;
  if (hourStr !== undefined) {
    hour = Number(hourStr);
  }
  let min = 0;
  if (minStr !== undefined) {
    min = Number(minStr);
  }
  let sec = 0;
  if (secStr !== undefined) {
    sec = Number(secStr);
  }
  let tzSign: "+" | "-" | "Z" | undefined;
  let tzHour = 0;
  let tzMin = 0;
  if (zStr === "Z") {
    tzSign = "Z";
  } else if (signStr === "+" || signStr === "-") {
    tzSign = signStr;
    tzHour = Number(tzHourStr);
    tzMin = Number(tzMinStr);
  }
  return {
    year,
    month,
    day,
    hour,
    min,
    sec,
    tzSign,
    tzHour,
    tzMin,
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
  if (parsed.tzSign === undefined) {
    return new Date(
      parsed.year,
      parsed.month - 1,
      parsed.day,
      parsed.hour,
      parsed.min,
      parsed.sec,
    );
  }
  const utcMs = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    parsed.hour,
    parsed.min,
    parsed.sec,
  );
  if (parsed.tzSign === "Z") {
    return new Date(utcMs);
  }
  let sign = -1;
  if (parsed.tzSign === "-") {
    sign = 1;
  }
  const offsetMs =
    sign * (parsed.tzHour * MINUTES_PER_HOUR + parsed.tzMin) * MS_PER_MINUTE;
  return new Date(utcMs + offsetMs);
};
