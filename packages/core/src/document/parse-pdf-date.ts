/** PDF 日時の YYYY 部分が受理される最小値（`Date.UTC` の 0..99 年自動補正回避）。 */
const YEAR_MIN = 1000;
/** PDF 日時の YYYY 部分が受理される最大値。 */
const YEAR_MAX = 9999;
/** 月の最小値（1 月）。 */
const MONTH_MIN = 1;
/** 月の最大値（12 月）。 */
const MONTH_MAX = 12;
/** 日の最小値。 */
const DAY_MIN = 1;
/** 日の最大値（31 日。実在チェックは probe で行う）。 */
const DAY_MAX = 31;
/** 時の最大値（23 時）。 */
const HOUR_MAX = 23;
/** 分・秒の最大値（59）。 */
const MINUTE_MAX = 59;
/** タイムゾーン分単位の係数（1 時間 = 60 分）。 */
const MINUTES_PER_HOUR = 60;
/** 1 分のミリ秒数。 */
const MS_PER_MINUTE = 60_000;

/**
 * `D:YYYY[MM[DD[HH[mm[SS]]]]][TZ]` 形式の正規表現。
 *
 * - **`D:` prefix は必須**（本プロジェクト固有の厳格仕様）。
 *   ISO 32000-2:2020 § 7.9.4 では `D:` は省略可能とされているが、本プロジェクトでは
 *   `D:YYYY...` 形式に統一して期待する PDF 日時オブジェクトを誤認しないようにする。
 *   `D:` を欠いた `20230101` のような入力は `undefined` で弾く。
 * - YYYY は 4 桁固定、必須
 * - MM, DD, HH, mm, SS は 2 桁単位で末尾から段階的に省略可能
 * - TZ は `Z` または `+HH'mm'` / `-HH'mm'`
 * - 末尾 `$` アンカで trailing garbage を拒否
 */
const DATE_PATTERN =
  /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:(Z)|([+-])(\d{2})'(\d{2})')?$/;

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
 * 数値が `[min, max]` の範囲内かを判定する。
 *
 * @param value - 検証対象
 * @param min - 下限（inclusive）
 * @param max - 上限（inclusive）
 * @returns 範囲内なら true
 */
const inRange = (value: number, min: number, max: number): boolean => {
  return value >= min && value <= max;
};

/**
 * オプショナルな 2 桁キャプチャを数値に変換する。未マッチ時は `fallback` を返す。
 *
 * @param captured - 正規表現のキャプチャ結果（未マッチ時 `undefined`）
 * @param fallback - 未マッチ時に使うデフォルト値
 * @returns 数値
 */
const numOrDefault = (
  captured: string | undefined,
  fallback: number,
): number => {
  if (captured === undefined) {
    return fallback;
  }
  return Number(captured);
};

/**
 * "D:..." 文字列を {@link ParsedDateParts} に分解し各成分の数値範囲を検証する。
 *
 * `RegExp.exec` は標準 API として `null` を返すため、`if (!match)` で
 * `undefined` に正規化する（プロジェクト内で以後 `null` を扱わない）。
 *
 * @param raw - PDF 日時文字列
 * @returns 成功時は分解された各成分。形式不正・範囲外時は `undefined`
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
    zMark,
    sign,
    tzHourStr,
    tzMinStr,
  ] = match;

  const year = Number(yearStr);
  if (!inRange(year, YEAR_MIN, YEAR_MAX)) {
    return undefined;
  }

  const month = numOrDefault(monthStr, MONTH_MIN);
  if (!inRange(month, MONTH_MIN, MONTH_MAX)) {
    return undefined;
  }

  const day = numOrDefault(dayStr, DAY_MIN);
  if (!inRange(day, DAY_MIN, DAY_MAX)) {
    return undefined;
  }

  const hour = numOrDefault(hourStr, 0);
  if (!inRange(hour, 0, HOUR_MAX)) {
    return undefined;
  }

  const min = numOrDefault(minStr, 0);
  if (!inRange(min, 0, MINUTE_MAX)) {
    return undefined;
  }

  const sec = numOrDefault(secStr, 0);
  if (!inRange(sec, 0, MINUTE_MAX)) {
    return undefined;
  }

  if (zMark === "Z") {
    return {
      year,
      month,
      day,
      hour,
      min,
      sec,
      tzSign: "Z",
      tzHour: 0,
      tzMin: 0,
    };
  }

  if (sign === "+" || sign === "-") {
    const tzHour = Number(tzHourStr);
    if (!inRange(tzHour, 0, HOUR_MAX)) {
      return undefined;
    }
    const tzMin = Number(tzMinStr);
    if (!inRange(tzMin, 0, MINUTE_MAX)) {
      return undefined;
    }
    return {
      year,
      month,
      day,
      hour,
      min,
      sec,
      tzSign: sign,
      tzHour,
      tzMin,
    };
  }

  return {
    year,
    month,
    day,
    hour,
    min,
    sec,
    tzSign: undefined,
    tzHour: 0,
    tzMin: 0,
  };
};

/**
 * `Date.UTC` で構築した probe の UTC 成分が入力成分と一致するかを検証する。
 *
 * 一致しない場合、自動繰り上がり（`2/31` → `3/3` など）が発生したことを意味する。
 * TZ 付き／なし共通でこの検証を実施することで、TZ 付き不在日 `D:20230231000000+09'00'`
 * もこの段階で弾く（review-002 反映）。
 *
 * @param parsed - 検証対象の各成分
 * @returns probe の UTC ミリ秒。成分一致しない場合 `undefined`
 */
const buildProbeMs = (parsed: ParsedDateParts): number | undefined => {
  const probeMs = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    parsed.hour,
    parsed.min,
    parsed.sec,
  );
  const probe = new Date(probeMs);
  if (
    probe.getUTCFullYear() !== parsed.year ||
    probe.getUTCMonth() !== parsed.month - 1 ||
    probe.getUTCDate() !== parsed.day ||
    probe.getUTCHours() !== parsed.hour ||
    probe.getUTCMinutes() !== parsed.min ||
    probe.getUTCSeconds() !== parsed.sec
  ) {
    return undefined;
  }
  return probeMs;
};

/**
 * PDF 日時文字列 `D:YYYY[MM[DD[HH[mm[SS]]]]][TZ]` を `Date` にパースする。
 *
 * 受理パターン:
 *   - YYYY (1000-9999, 4 桁固定, 必須)
 *   - MM, DD, HH, mm, SS は末尾から段階的に省略可
 *   - TZ は `Z` / `+HH'mm'` / `-HH'mm'` / 省略
 *   - trailing garbage 禁止、TZ 末尾 `'` 必須
 *
 * 検証フロー:
 *   1. `DATE_PATTERN` 正規表現で構文と各成分の範囲を検証（`extractDateParts`）
 *   2. `Date.UTC` で probe ms を構築し、UTC 成分一致検証で自動繰り上がりを弾く
 *   3. TZ なし → `new Date(local)`、TZ "Z" → `new Date(probeMs)`、
 *      TZ ± → `new Date(probeMs + offsetMs)` で最終 Date を返す
 *
 * 警告は本関数では push せず、caller 側で `parsePdfDate(raw) === undefined`
 * を検出して `DATE_PARSE_FAILED` を push する想定。
 *
 * @param raw - PDF 日時文字列
 * @returns 成功時は `Date`、失敗時は `undefined`
 */
export const parsePdfDate = (raw: string): Date | undefined => {
  const parsed = extractDateParts(raw);
  if (parsed === undefined) {
    return undefined;
  }

  const probeMs = buildProbeMs(parsed);
  if (probeMs === undefined) {
    return undefined;
  }

  if (parsed.tzSign === undefined) {
    const local = new Date(
      parsed.year,
      parsed.month - 1,
      parsed.day,
      parsed.hour,
      parsed.min,
      parsed.sec,
    );
    // ローカル DST ギャップ（例: 春の 02:30 が 03:30 に繰り上がる）で
    // 「存在しないローカル時刻」を入力された場合、`new Date(...)` が
    // 自動補正して別時刻になる。各成分が入力と一致するか検証して
    // 一致しない場合は undefined にして弾く。
    if (
      local.getFullYear() !== parsed.year ||
      local.getMonth() !== parsed.month - 1 ||
      local.getDate() !== parsed.day ||
      local.getHours() !== parsed.hour ||
      local.getMinutes() !== parsed.min ||
      local.getSeconds() !== parsed.sec
    ) {
      return undefined;
    }
    return local;
  }

  if (parsed.tzSign === "Z") {
    return new Date(probeMs);
  }

  // '+09:00' は UTC より 9h 早いので、UTC ms から TZ オフセットを引く（符号反転）
  let sign = 1;
  if (parsed.tzSign === "+") {
    sign = -1;
  }
  const offsetMs =
    sign * (parsed.tzHour * MINUTES_PER_HOUR + parsed.tzMin) * MS_PER_MINUTE;
  return new Date(probeMs + offsetMs);
};
