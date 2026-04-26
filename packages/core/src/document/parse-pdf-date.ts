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

/**
 * `D:YYYY[MM[DD[HH[mm[SS]]]]][TZ]` 構造を完全一致で検証する正規表現。
 *
 * - 末尾 `$` アンカで trailing garbage を拒否
 * - TZ ブロックは `Z` または `±HH'mm'` のいずれか、または省略
 * - 末尾 `'` 必須（`+09'00` のような欠落形は不一致）
 */
const DATE_PATTERN =
  /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:(Z)|([+-])(\d{2})'(\d{2})')?$/;

const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = 60_000;

const YEAR_MIN = 1000;
const YEAR_MAX = 9999;
const MONTH_MIN = 1;
const MONTH_MAX = 12;
const DAY_MIN = 1;
const DAY_MAX = 31;
const TIME_MIN = 0;
const HOUR_MAX = 23;
const MIN_MAX = 59;
const SEC_MAX = 59;

/**
 * `"D:..."` 文字列を {@link DATE_PATTERN} で構造検証し {@link ParsedDateParts}
 * に分解、各成分を範囲検証する。
 *
 * `RegExp.exec` が標準 API として `null` を返すため、この境界で `undefined` に
 * 正規化する。プロジェクト内では以後 `null` を扱わない。
 *
 * @param raw - PDF 日時文字列
 * @returns 構造・範囲が妥当な場合 `ParsedDateParts`、不正な場合 `undefined`
 */
const extractDateParts = (raw: string): ParsedDateParts | undefined => {
  const match = DATE_PATTERN.exec(raw);
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
  if (year < YEAR_MIN || year > YEAR_MAX) {
    return undefined;
  }
  let month = 1;
  if (monthStr !== undefined) {
    month = Number(monthStr);
  }
  if (month < MONTH_MIN || month > MONTH_MAX) {
    return undefined;
  }
  let day = 1;
  if (dayStr !== undefined) {
    day = Number(dayStr);
  }
  if (day < DAY_MIN || day > DAY_MAX) {
    return undefined;
  }
  let hour = 0;
  if (hourStr !== undefined) {
    hour = Number(hourStr);
  }
  if (hour < TIME_MIN || hour > HOUR_MAX) {
    return undefined;
  }
  let min = 0;
  if (minStr !== undefined) {
    min = Number(minStr);
  }
  if (min < TIME_MIN || min > MIN_MAX) {
    return undefined;
  }
  let sec = 0;
  if (secStr !== undefined) {
    sec = Number(secStr);
  }
  if (sec < TIME_MIN || sec > SEC_MAX) {
    return undefined;
  }
  let tzSign: "+" | "-" | "Z" | undefined;
  let tzHour = 0;
  let tzMin = 0;
  if (zStr === "Z") {
    tzSign = "Z";
  } else if (signStr === "+" || signStr === "-") {
    tzSign = signStr;
    tzHour = Number(tzHourStr);
    if (tzHour < TIME_MIN || tzHour > HOUR_MAX) {
      return undefined;
    }
    tzMin = Number(tzMinStr);
    if (tzMin < TIME_MIN || tzMin > MIN_MAX) {
      return undefined;
    }
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
 * `parsed` の各成分が UTC で構築した `probe` の成分と一致するかを検証する。
 *
 * `Date.UTC` は `Date` コンストラクタと同様に範囲外を自動繰り上がり
 * （2/31 → 3/3 等）するため、`day` 範囲チェックを通過した不在日や、TZ 付き
 * 不在日 (`D:20230231000000+09'00'`) を弾くために UTC 成分一致検証を行う。
 *
 * @param parsed - {@link extractDateParts} の戻り値
 * @param probe - `Date.UTC(...)` で構築した {@link Date}
 * @returns 全成分一致時 `true`
 */
const matchesProbe = (parsed: ParsedDateParts, probe: Date): boolean => {
  if (probe.getUTCFullYear() !== parsed.year) {
    return false;
  }
  if (probe.getUTCMonth() !== parsed.month - 1) {
    return false;
  }
  if (probe.getUTCDate() !== parsed.day) {
    return false;
  }
  if (probe.getUTCHours() !== parsed.hour) {
    return false;
  }
  if (probe.getUTCMinutes() !== parsed.min) {
    return false;
  }
  if (probe.getUTCSeconds() !== parsed.sec) {
    return false;
  }
  return true;
};

/**
 * `±HH'mm'` 形式の TZ オフセットを ms で返す。
 *
 * PDF の `+HH'mm'` は「ローカルが UTC より進んでいる」を意味するため、
 * UTC ms へ戻す際は符号を反転する（`+09'00'` なら `-9 時間`）。
 *
 * @param sign - `"+"` または `"-"`
 * @param tzHour - TZ 時 (0-23)
 * @param tzMin - TZ 分 (0-59)
 * @returns UTC ms に加算するオフセット
 */
const tzOffsetMs = (sign: "+" | "-", tzHour: number, tzMin: number): number => {
  let direction = -1;
  if (sign === "-") {
    direction = 1;
  }
  return direction * (tzHour * MINUTES_PER_HOUR + tzMin) * MS_PER_MINUTE;
};

/**
 * PDF 日時文字列 `"D:YYYY[MM[DD[HH[mm[SS]]]]][TZ]"` を {@link Date} にパースする。
 *
 * 4 ステップで構成される:
 *  1. `D:` プレフィックス検証
 *  2. {@link extractDateParts} による構造・成分範囲検証
 *  3. UTC で組んだ `probe` との成分一致検証（自動繰り上がり / 不在日防止）
 *  4. TZ 種別に応じた最終 {@link Date} 構築
 *      - 省略時はローカル時刻として構築
 *      - `Z` は UTC 時刻として構築
 *      - `±HH'mm'` は UTC へオフセット補正
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
  const probeMs = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    parsed.hour,
    parsed.min,
    parsed.sec,
  );
  if (!matchesProbe(parsed, new Date(probeMs))) {
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
  if (parsed.tzSign === "Z") {
    return new Date(probeMs);
  }
  return new Date(
    probeMs + tzOffsetMs(parsed.tzSign, parsed.tzHour, parsed.tzMin),
  );
};
