//! PDF 日時表現 (`PdfDate`) およびパース処理。
//!
//! ISO 32000-1 §7.9.4 / ISO 32000-2 §7.9.4 に規定される PDF の日時形式
//! `(D:YYYYMMDDHHmmSSOHH'mm')` を型安全に表現し、パースする。

/// タイムゾーンの符号。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OffsetSign {
    /// '+' (UTCより進んでいる)
    Plus,
    /// '-' (UTCより遅れている)
    Minus,
}

/// タイムゾーンオフセット。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PdfDateOffset {
    /// UTC ('Z')。
    Utc,
    /// 符号・時・分によるローカルオフセット。
    Local {
        /// 符号。
        sign: OffsetSign,
        /// 時 (0..=23)。
        hours: u8,
        /// 分 (0..=59)。
        minutes: u8,
    },
}

impl PdfDateOffset {
    /// UTC ('Z') オフセットを生成する。
    #[must_use]
    pub const fn utc() -> Self {
        Self::Utc
    }

    /// 符号・時・分からローカルオフセットを生成する（時: 0..=23, 分: 0..=59）。
    #[must_use]
    pub fn new(sign: OffsetSign, hours: u8, minutes: u8) -> Option<Self> {
        if hours > 23 || minutes > 59 {
            return None;
        }
        Some(Self::Local {
            sign,
            hours,
            minutes,
        })
    }

    /// 符号を返す（UTC の場合は None）。
    #[must_use]
    pub fn sign(&self) -> Option<OffsetSign> {
        match *self {
            Self::Utc => None,
            Self::Local { sign, .. } => Some(sign),
        }
    }

    /// 時を返す（UTC の場合は 0）。
    #[must_use]
    pub fn hours(&self) -> u8 {
        match *self {
            Self::Utc => 0,
            Self::Local { hours, .. } => hours,
        }
    }

    /// 分を返す（UTC の場合は 0）。
    #[must_use]
    pub fn minutes(&self) -> u8 {
        match *self {
            Self::Utc => 0,
            Self::Local { minutes, .. } => minutes,
        }
    }

    /// UTC ('Z') として指定されたかどうかを返す。
    #[must_use]
    pub fn is_utc(&self) -> bool {
        matches!(*self, Self::Utc)
    }

    /// UTC に対する符号付き総オフセット分（-1439..=1439）を返す。
    #[must_use]
    pub fn total_offset_minutes(&self) -> i16 {
        match *self {
            Self::Utc => 0,
            Self::Local {
                sign,
                hours,
                minutes,
            } => {
                let total = (i16::from(hours)) * 60 + i16::from(minutes);
                match sign {
                    OffsetSign::Minus => -total,
                    OffsetSign::Plus => total,
                }
            }
        }
    }
}

/// PDF 日付型。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PdfDate {
    year: i32,
    month: Option<u8>,
    day: Option<u8>,
    hour: Option<u8>,
    minute: Option<u8>,
    second: Option<u8>,
    offset: Option<PdfDateOffset>,
}

impl PdfDate {
    /// 文字列から PDF 日付をパースする。
    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        Self::from_bytes(s.as_bytes())
    }

    /// バイト列から PDF 日付をパースする。
    #[must_use]
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        let rest = bytes.strip_prefix(b"D:").unwrap_or(bytes);

        let (year, mut rest) = take_4_digits(rest)?;

        let mut month = None;
        let mut day = None;
        let mut hour = None;
        let mut minute = None;
        let mut second = None;
        let mut offset = None;

        // 各フィールドのパースを順次進行。TZ 開始文字または終端に達したらループを抜ける。
        enum Step {
            Month,
            Day(u8),
            Hour,
            Minute,
            Second,
            Done,
        }

        let mut step = Step::Month;

        while !rest.is_empty() {
            if is_tz_start(rest) {
                offset = Some(parse_tz(rest)?);
                rest = &[];
                break;
            }

            match step {
                Step::Month => {
                    let (m, remaining) = take_2_digits(rest)?;
                    if !(1..=12).contains(&m) {
                        return None;
                    }
                    month = Some(m);
                    rest = remaining;
                    step = Step::Day(m);
                }
                Step::Day(m) => {
                    let (d, remaining) = take_2_digits(rest)?;
                    let max_days = days_in_month(year, m);
                    if d < 1 || d > max_days {
                        return None;
                    }
                    day = Some(d);
                    rest = remaining;
                    step = Step::Hour;
                }
                Step::Hour => {
                    let (h, remaining) = take_2_digits(rest)?;
                    if h > 23 {
                        return None;
                    }
                    hour = Some(h);
                    rest = remaining;
                    step = Step::Minute;
                }
                Step::Minute => {
                    let (min, remaining) = take_2_digits(rest)?;
                    if min > 59 {
                        return None;
                    }
                    minute = Some(min);
                    rest = remaining;
                    step = Step::Second;
                }
                Step::Second => {
                    let (s, remaining) = take_2_digits(rest)?;
                    if s > 59 {
                        return None;
                    }
                    second = Some(s);
                    rest = remaining;
                    step = Step::Done;
                }
                Step::Done => {
                    // 秒以降で TZ 開始文字でもない未消費文字がある場合は拒否
                    return None;
                }
            }
        }

        // 未消費文字が残っていれば拒否 (trailing garbage)
        if !rest.is_empty() {
            return None;
        }

        Some(Self {
            year,
            month,
            day,
            hour,
            minute,
            second,
            offset,
        })
    }

    /// 年（4桁）を返す。
    #[must_use]
    pub fn year(&self) -> i32 {
        self.year
    }

    /// 月（1..=12）を返す。未指定時は `None`。
    #[must_use]
    pub fn month(&self) -> Option<u8> {
        self.month
    }

    /// 日（1..=31）を返す。未指定時は `None`。
    #[must_use]
    pub fn day(&self) -> Option<u8> {
        self.day
    }

    /// 時（0..=23）を返す。未指定時は `None`。
    #[must_use]
    pub fn hour(&self) -> Option<u8> {
        self.hour
    }

    /// 分（0..=59）を返す。未指定時は `None`。
    #[must_use]
    pub fn minute(&self) -> Option<u8> {
        self.minute
    }

    /// 秒（0..=59）を返す。未指定時は `None`。
    #[must_use]
    pub fn second(&self) -> Option<u8> {
        self.second
    }

    /// タイムゾーンオフセットを返す。未指定時は `None`。
    #[must_use]
    pub fn offset(&self) -> Option<PdfDateOffset> {
        self.offset
    }
}

fn is_tz_start(bytes: &[u8]) -> bool {
    matches!(bytes.first(), Some(b'+' | b'-' | b'Z'))
}

fn take_4_digits(bytes: &[u8]) -> Option<(i32, &[u8])> {
    let (&[b0, b1, b2, b3], rest) = bytes.split_first_chunk::<4>()?;
    if !b0.is_ascii_digit() || !b1.is_ascii_digit() || !b2.is_ascii_digit() || !b3.is_ascii_digit()
    {
        return None;
    }
    let d0 = i32::from(b0 - b'0');
    let d1 = i32::from(b1 - b'0');
    let d2 = i32::from(b2 - b'0');
    let d3 = i32::from(b3 - b'0');
    Some((d0 * 1000 + d1 * 100 + d2 * 10 + d3, rest))
}

fn take_2_digits(bytes: &[u8]) -> Option<(u8, &[u8])> {
    let (&[b0, b1], rest) = bytes.split_first_chunk::<2>()?;
    if !b0.is_ascii_digit() || !b1.is_ascii_digit() {
        return None;
    }
    let d0 = b0 - b'0';
    let d1 = b1 - b'0';
    Some((d0 * 10 + d1, rest))
}

fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

fn days_in_month(year: i32, month: u8) -> u8 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap_year(year) {
                29
            } else {
                28
            }
        }
        _ => 0,
    }
}

fn parse_tz(bytes: &[u8]) -> Option<PdfDateOffset> {
    let (sign_byte, rest) = bytes.split_first()?;
    if *sign_byte == b'Z' {
        if rest.is_empty() {
            return Some(PdfDateOffset::utc());
        }
        // trailing garbage
        return None;
    }

    let sign = match *sign_byte {
        b'+' => OffsetSign::Plus,
        b'-' => OffsetSign::Minus,
        _ => return None,
    };

    let (hours, rest) = take_2_digits(rest)?;
    if hours > 23 {
        return None;
    }

    let mut minutes = 0;

    if rest.is_empty() {
        // 分省略 (ISO 32000-2形式: +HH / -HH)
        return PdfDateOffset::new(sign, hours, minutes);
    }

    // アポストロフィで始まる場合 (ISO 32000-1形式 or 分省略)
    let rest = rest.strip_prefix(b"'")?;
    if rest.is_empty() {
        // 分省略 + アポストロフィ (ISO 32000-1形式分省略: +HH' / -HH')
        return PdfDateOffset::new(sign, hours, minutes);
    }

    // 分が続く (+HH'mm / +HH'mm')
    let (m, rest) = take_2_digits(rest)?;
    if m > 59 {
        return None;
    }
    minutes = m;

    if rest.is_empty() || rest == b"'" {
        // ISO 32000-2 形式 (+HH'mm) または ISO 32000-1 形式 (+HH'mm')
        return PdfDateOffset::new(sign, hours, minutes);
    }

    None
}

#[cfg(test)]
mod tests;
