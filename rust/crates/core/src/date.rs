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
pub struct PdfDateOffset {
    sign: Option<OffsetSign>,
    hours: u8,
    minutes: u8,
    is_utc: bool,
}

impl PdfDateOffset {
    /// UTC ('Z') オフセットを生成する。
    #[must_use]
    pub const fn utc() -> Self {
        Self {
            sign: None,
            hours: 0,
            minutes: 0,
            is_utc: true,
        }
    }

    /// 符号・時・分からオフセットを生成する（時: 0..=23, 分: 0..=59）。
    #[must_use]
    pub fn new(sign: OffsetSign, hours: u8, minutes: u8) -> Option<Self> {
        if hours > 23 || minutes > 59 {
            return None;
        }
        Some(Self {
            sign: Some(sign),
            hours,
            minutes,
            is_utc: false,
        })
    }

    /// 符号を返す（UTC の場合は None）。
    #[must_use]
    pub fn sign(&self) -> Option<OffsetSign> {
        self.sign
    }

    /// 時を返す。
    #[must_use]
    pub fn hours(&self) -> u8 {
        self.hours
    }

    /// 分を返す。
    #[must_use]
    pub fn minutes(&self) -> u8 {
        self.minutes
    }

    /// UTC ('Z') として指定されたかどうかを返す。
    #[must_use]
    pub fn is_utc(&self) -> bool {
        self.is_utc
    }

    /// UTC に対する符号付き総オフセット分（-1439..=1439）を返す。
    #[must_use]
    pub fn total_offset_minutes(&self) -> i16 {
        let total = (i16::from(self.hours)) * 60 + i16::from(self.minutes);
        match self.sign {
            Some(OffsetSign::Minus) => -total,
            _ => total,
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
        let rest = if bytes.starts_with(b"D:") {
            &bytes[2..]
        } else {
            bytes
        };

        if rest.len() < 4 {
            return None;
        }
        let year = parse_4_digits(&rest[0..4])?;
        let mut rest = &rest[4..];

        let mut month = None;
        let mut day = None;
        let mut hour = None;
        let mut minute = None;
        let mut second = None;
        let mut offset = None;

        if rest.is_empty() {
            return Some(Self {
                year,
                month,
                day,
                hour,
                minute,
                second,
                offset,
            });
        }

        if is_tz_start(rest[0]) {
            offset = Some(parse_tz(rest)?);
            return Some(Self {
                year,
                month,
                day,
                hour,
                minute,
                second,
                offset,
            });
        }

        if rest.len() < 2 {
            return None;
        }
        let m = parse_2_digits(&rest[0..2])?;
        if !(1..=12).contains(&m) {
            return None;
        }
        month = Some(m);
        rest = &rest[2..];

        if rest.is_empty() {
            return Some(Self {
                year,
                month,
                day,
                hour,
                minute,
                second,
                offset,
            });
        }
        if is_tz_start(rest[0]) {
            offset = Some(parse_tz(rest)?);
            return Some(Self {
                year,
                month,
                day,
                hour,
                minute,
                second,
                offset,
            });
        }

        // 日
        if rest.len() < 2 {
            return None;
        }
        let d = parse_2_digits(&rest[0..2])?;
        let max_days = days_in_month(year, m);
        if d < 1 || d > max_days {
            return None;
        }
        day = Some(d);
        rest = &rest[2..];

        if rest.is_empty() {
            return Some(Self {
                year,
                month,
                day,
                hour,
                minute,
                second,
                offset,
            });
        }
        if is_tz_start(rest[0]) {
            offset = Some(parse_tz(rest)?);
            return Some(Self {
                year,
                month,
                day,
                hour,
                minute,
                second,
                offset,
            });
        }

        // 時
        if rest.len() < 2 {
            return None;
        }
        let h = parse_2_digits(&rest[0..2])?;
        if h > 23 {
            return None;
        }
        hour = Some(h);
        rest = &rest[2..];

        if rest.is_empty() {
            return Some(Self {
                year,
                month,
                day,
                hour,
                minute,
                second,
                offset,
            });
        }
        if is_tz_start(rest[0]) {
            offset = Some(parse_tz(rest)?);
            return Some(Self {
                year,
                month,
                day,
                hour,
                minute,
                second,
                offset,
            });
        }

        // 分
        if rest.len() < 2 {
            return None;
        }
        let min = parse_2_digits(&rest[0..2])?;
        if min > 59 {
            return None;
        }
        minute = Some(min);
        rest = &rest[2..];

        if rest.is_empty() {
            return Some(Self {
                year,
                month,
                day,
                hour,
                minute,
                second,
                offset,
            });
        }
        if is_tz_start(rest[0]) {
            offset = Some(parse_tz(rest)?);
            return Some(Self {
                year,
                month,
                day,
                hour,
                minute,
                second,
                offset,
            });
        }

        // 秒
        if rest.len() < 2 {
            return None;
        }
        let s = parse_2_digits(&rest[0..2])?;
        if s > 59 {
            return None;
        }
        second = Some(s);
        rest = &rest[2..];

        if rest.is_empty() {
            return Some(Self {
                year,
                month,
                day,
                hour,
                minute,
                second,
                offset,
            });
        }
        if is_tz_start(rest[0]) {
            offset = Some(parse_tz(rest)?);
            return Some(Self {
                year,
                month,
                day,
                hour,
                minute,
                second,
                offset,
            });
        }

        // 余分な未消費文字がある場合は拒否
        None
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

fn is_tz_start(b: u8) -> bool {
    matches!(b, b'+' | b'-' | b'Z')
}

fn parse_4_digits(bytes: &[u8]) -> Option<i32> {
    if bytes.len() != 4 || !bytes.iter().all(u8::is_ascii_digit) {
        return None;
    }
    let d0 = i32::from(bytes[0] - b'0');
    let d1 = i32::from(bytes[1] - b'0');
    let d2 = i32::from(bytes[2] - b'0');
    let d3 = i32::from(bytes[3] - b'0');
    Some(d0 * 1000 + d1 * 100 + d2 * 10 + d3)
}

fn parse_2_digits(bytes: &[u8]) -> Option<u8> {
    if bytes.len() != 2 || !bytes.iter().all(u8::is_ascii_digit) {
        return None;
    }
    let d0 = bytes[0] - b'0';
    let d1 = bytes[1] - b'0';
    Some(d0 * 10 + d1)
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
    if bytes.is_empty() {
        return None;
    }
    if bytes[0] == b'Z' {
        if bytes.len() == 1 {
            return Some(PdfDateOffset::utc());
        }
        // trailing garbage
        return None;
    }

    let sign = match bytes[0] {
        b'+' => OffsetSign::Plus,
        b'-' => OffsetSign::Minus,
        _ => return None,
    };

    let mut rest = &bytes[1..];
    if rest.len() < 2 {
        return None;
    }
    let hours = parse_2_digits(&rest[0..2])?;
    if hours > 23 {
        return None;
    }
    rest = &rest[2..];

    let mut minutes = 0;

    if rest.is_empty() {
        // 分省略 (ISO 32000-2形式: +HH / -HH)
        return PdfDateOffset::new(sign, hours, minutes);
    }

    // アポストロフィで始まる場合 (ISO 32000-1形式 or 分省略)
    if rest[0] == b'\'' {
        rest = &rest[1..];
        if rest.is_empty() {
            // 分省略 + アポストロフィ (ISO 32000-1形式分省略: +HH' / -HH')
            return PdfDateOffset::new(sign, hours, minutes);
        }
        // 分が続く (+HH'mm / +HH'mm')
        if rest.len() < 2 {
            return None;
        }
        minutes = parse_2_digits(&rest[0..2])?;
        if minutes > 59 {
            return None;
        }
        rest = &rest[2..];

        if rest.is_empty() {
            // ISO 32000-2 形式 (+HH'mm)
            return PdfDateOffset::new(sign, hours, minutes);
        }
        if rest == b"'" {
            // ISO 32000-1 形式 (+HH'mm')
            return PdfDateOffset::new(sign, hours, minutes);
        }
        return None;
    }

    // アポストロフィがない場合（不正形式: +0900 など）
    None
}

#[cfg(test)]
mod tests;
