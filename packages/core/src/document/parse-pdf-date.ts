/**
 * PDF 日時文字列をパースした各成分。
 * 範囲検証済み。`tzSign` が `"+"` / `"-"` のときのみ `tzHour` / `tzMin` が意味を持つ。
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

/**
 * "D:..." 文字列を {@link ParsedDateParts} に分解し各成分の数値範囲を検証する。
 *
 * @param raw - PDF 日時文字列
 * @returns 成功時は分解された各成分。形式不正・範囲外時は `undefined`
 */
const extractDateParts = (raw: string): ParsedDateParts | undefined => {
  if (!raw.startsWith("D:")) {
    return undefined;
  }
  return undefined;
};

/**
 * PDF 日時文字列 `D:YYYY[MM[DD[HH[mm[SS]]]]][TZ]` を `Date` にパースする。
 *
 * 警告は本関数では push せず、caller 側で `parsePdfDate(raw) === undefined`
 * を検出して `DATE_PARSE_FAILED` を push する想定（既存 `resolveResources` と同形）。
 *
 * @param raw - PDF 日時文字列
 * @returns 成功時は `Date`、失敗時は `undefined`
 */
export const parsePdfDate = (raw: string): Date | undefined => {
  const parsed = extractDateParts(raw);
  if (parsed === undefined) {
    return undefined;
  }
  return undefined;
};
