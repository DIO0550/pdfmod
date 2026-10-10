use super::*;

#[test]
fn test_year_only_with_prefix() {
    let date = PdfDate::parse("D:2026").expect("parse should succeed");
    assert_eq!(date.year(), 2026);
    assert_eq!(date.month(), None);
    assert_eq!(date.day(), None);
    assert_eq!(date.hour(), None);
    assert_eq!(date.minute(), None);
    assert_eq!(date.second(), None);
    assert_eq!(date.offset(), None);
}

#[test]
fn test_year_only_without_prefix() {
    let date = PdfDate::parse("2026").expect("parse should succeed");
    assert_eq!(date.year(), 2026);
    assert_eq!(date.month(), None);
    assert_eq!(date.offset(), None);
}

#[test]
fn test_iso_32000_1_full() {
    let date = PdfDate::parse("D:20260314120000+09'00'").expect("parse should succeed");
    assert_eq!(date.year(), 2026);
    assert_eq!(date.month(), Some(3));
    assert_eq!(date.day(), Some(14));
    assert_eq!(date.hour(), Some(12));
    assert_eq!(date.minute(), Some(0));
    assert_eq!(date.second(), Some(0));

    let offset = date.offset().expect("offset should exist");
    assert_eq!(
        offset,
        PdfDateOffset::Local(LocalOffset::new(OffsetSign::Plus, 9, 0).unwrap())
    );
    assert_eq!(offset.sign(), Some(OffsetSign::Plus));
    assert_eq!(offset.hours(), 9);
    assert_eq!(offset.minutes(), 0);
    assert!(!offset.is_utc());
    assert_eq!(offset.total_offset_minutes(), 540);
}

#[test]
fn test_iso_32000_2_full() {
    let date = PdfDate::parse("D:20260314120000+09'00").expect("parse should succeed");
    assert_eq!(date.year(), 2026);
    assert_eq!(date.month(), Some(3));
    assert_eq!(date.day(), Some(14));
    assert_eq!(date.hour(), Some(12));
    assert_eq!(date.minute(), Some(0));
    assert_eq!(date.second(), Some(0));

    let offset = date.offset().expect("offset should exist");
    assert_eq!(offset.sign(), Some(OffsetSign::Plus));
    assert_eq!(offset.hours(), 9);
    assert_eq!(offset.minutes(), 0);
    assert_eq!(offset.total_offset_minutes(), 540);
}

#[test]
fn test_minute_omitted_with_apostrophe() {
    let date = PdfDate::parse("D:20260314120000+09'").expect("parse should succeed");
    let offset = date.offset().expect("offset should exist");
    assert_eq!(offset.sign(), Some(OffsetSign::Plus));
    assert_eq!(offset.hours(), 9);
    assert_eq!(offset.minutes(), 0);
    assert_eq!(offset.total_offset_minutes(), 540);
}

#[test]
fn test_minute_omitted_without_apostrophe() {
    let date = PdfDate::parse("D:20260314120000+09").expect("parse should succeed");
    let offset = date.offset().expect("offset should exist");
    assert_eq!(offset.sign(), Some(OffsetSign::Plus));
    assert_eq!(offset.hours(), 9);
    assert_eq!(offset.minutes(), 0);
    assert_eq!(offset.total_offset_minutes(), 540);
}

#[test]
fn test_utc_z() {
    let date = PdfDate::parse("D:20260314120000Z").expect("parse should succeed");
    let offset = date.offset().expect("offset should exist");
    assert_eq!(offset, PdfDateOffset::Utc);
    assert_eq!(offset.sign(), None);
    assert_eq!(offset.hours(), 0);
    assert_eq!(offset.minutes(), 0);
    assert!(offset.is_utc());
    assert_eq!(offset.total_offset_minutes(), 0);
}

#[test]
fn test_negative_offset_variants() {
    let inputs = [
        "D:20260314120000-05'00'",
        "D:20260314120000-05'00",
        "D:20260314120000-05'",
        "D:20260314120000-05",
    ];
    for input in inputs {
        let date = PdfDate::parse(input).expect("parse should succeed");
        let offset = date.offset().expect("offset should exist");
        assert_eq!(offset.sign(), Some(OffsetSign::Minus));
        assert_eq!(offset.hours(), 5);
        assert_eq!(offset.minutes(), 0);
        assert!(!offset.is_utc());
        assert_eq!(offset.total_offset_minutes(), -300);
    }
}

#[test]
fn test_hierarchical_omission() {
    let d1 = PdfDate::parse("D:202603").expect("parse month should succeed");
    assert_eq!(d1.year(), 2026);
    assert_eq!(d1.month(), Some(3));
    assert_eq!(d1.day(), None);

    let d2 = PdfDate::parse("D:20260314").expect("parse day should succeed");
    assert_eq!(d2.year(), 2026);
    assert_eq!(d2.month(), Some(3));
    assert_eq!(d2.day(), Some(14));
    assert_eq!(d2.hour(), None);

    let d3 = PdfDate::parse("D:2026031412").expect("parse hour should succeed");
    assert_eq!(d3.hour(), Some(12));
    assert_eq!(d3.minute(), None);

    let d4 = PdfDate::parse("D:202603141200").expect("parse minute should succeed");
    assert_eq!(d4.minute(), Some(0));
    assert_eq!(d4.second(), None);

    let d5 = PdfDate::parse("D:20260314120000").expect("parse second should succeed");
    assert_eq!(d5.second(), Some(0));
    assert_eq!(d5.offset(), None);
}

#[test]
fn test_leap_year() {
    // 4で割り切れる年
    let d1 = PdfDate::parse("D:20240229").expect("leap year 2024 should succeed");
    assert_eq!(d1.day(), Some(29));

    // 400で割り切れる年
    let d2 = PdfDate::parse("D:20000229").expect("leap year 2000 should succeed");
    assert_eq!(d2.day(), Some(29));

    // 平年 2023年
    assert!(PdfDate::parse("D:20230229").is_none());

    // 100で割り切れ400で割り切れない平年 1900年
    assert!(PdfDate::parse("D:19000229").is_none());
}

#[test]
fn test_month_days_boundaries() {
    // 大の月 (1月31日)
    assert!(PdfDate::parse("D:20260131").is_some());
    // 小の月 (4月30日)
    assert!(PdfDate::parse("D:20260430").is_some());
    // 平年2月28日
    assert!(PdfDate::parse("D:20230228").is_some());

    // 小の月 (4月31日) -> 不正
    assert!(PdfDate::parse("D:20260431").is_none());
    // 小の月 (6月31日, 9月31日, 11月31日) -> 不正
    assert!(PdfDate::parse("D:20260631").is_none());
    assert!(PdfDate::parse("D:20260931").is_none());
    assert!(PdfDate::parse("D:20261131").is_none());
}

#[test]
fn test_month_and_day_range() {
    assert!(PdfDate::parse("D:20260001").is_none()); // 0月
    assert!(PdfDate::parse("D:20261301").is_none()); // 13月
    assert!(PdfDate::parse("D:20260100").is_none()); // 0日
    assert!(PdfDate::parse("D:20260132").is_none()); // 32日
}

#[test]
fn test_time_boundaries_and_range() {
    // 最小値
    assert!(PdfDate::parse("D:20260314000000").is_some());
    // 最大値
    assert!(PdfDate::parse("D:20260314235959").is_some());

    // 範囲外
    assert!(PdfDate::parse("D:20260314240000").is_none()); // 24時
    assert!(PdfDate::parse("D:20260314126000").is_none()); // 60分
    assert!(PdfDate::parse("D:20260314120060").is_none()); // 60秒
}

#[test]
fn test_tz_boundaries_and_range() {
    // ゼロオフセット
    assert!(PdfDate::parse("D:20260314120000+00'00'").is_some());
    assert!(PdfDate::parse("D:20260314120000-00'00'").is_some());

    // 最大オフセット
    assert!(PdfDate::parse("D:20260314120000+23'59'").is_some());

    // 範囲外
    assert!(PdfDate::parse("D:20260314120000+24'00'").is_none());
    assert!(PdfDate::parse("D:20260314120000+09'60'").is_none());
}

#[test]
fn test_trailing_garbage() {
    assert!(PdfDate::parse("D:20260314XYZ").is_none());
    assert!(PdfDate::parse("D:2026+09'00'extra").is_none());
    assert!(PdfDate::parse("D:2026Zextra").is_none());
    assert!(PdfDate::parse("D:20260314120000+09'00'abc").is_none());
}

#[test]
fn test_syntax_errors() {
    assert!(PdfDate::parse("D:").is_none());
    assert!(PdfDate::parse("D:202").is_none());
    assert!(PdfDate::parse("D:202A").is_none());
    assert!(PdfDate::parse("").is_none());
    assert!(PdfDate::parse("D:20260").is_none());
    assert!(PdfDate::parse("D:2026031").is_none());
    assert!(PdfDate::parse("D:202603141").is_none());
    assert!(PdfDate::parse("D:20260314120000+").is_none());
    assert!(PdfDate::parse("D:20260314120000+9").is_none());
    assert!(PdfDate::parse("D:20260314120000+0900").is_none());
    assert!(PdfDate::parse("D:20260314120000+09'0").is_none());
}

#[test]
fn test_tz_immediately_after_omitted_fields() {
    let d1 = PdfDate::parse("D:2026Z").expect("parse year + Z should succeed");
    assert_eq!(d1.year(), 2026);
    assert_eq!(d1.month(), None);
    assert!(d1.offset().expect("offset").is_utc());

    let d2 = PdfDate::parse("D:202603+09'00'").expect("parse month + TZ should succeed");
    assert_eq!(d2.year(), 2026);
    assert_eq!(d2.month(), Some(3));
    assert_eq!(d2.day(), None);
    assert_eq!(d2.offset().expect("offset").hours(), 9);

    let d3 = PdfDate::parse("D:20260314+09'00'").expect("parse day + TZ should succeed");
    assert_eq!(d3.year(), 2026);
    assert_eq!(d3.day(), Some(14));
    assert_eq!(d3.hour(), None);
    assert_eq!(d3.offset().expect("offset").hours(), 9);
}

#[test]
fn test_full_without_d_prefix() {
    let date = PdfDate::parse("20260314120000+09'00'").expect("parse without D: prefix");
    assert_eq!(date.year(), 2026);
    assert_eq!(date.month(), Some(3));
    assert_eq!(date.day(), Some(14));
    assert_eq!(date.hour(), Some(12));
    assert_eq!(date.minute(), Some(0));
    assert_eq!(date.second(), Some(0));
    assert_eq!(date.offset().expect("offset").hours(), 9);
}

#[test]
fn test_accessors_and_helpers() {
    let date = PdfDate::parse("D:20260314120000-05'30'").expect("parse should succeed");
    assert_eq!(date.year(), 2026);
    assert_eq!(date.month(), Some(3));
    assert_eq!(date.day(), Some(14));
    assert_eq!(date.hour(), Some(12));
    assert_eq!(date.minute(), Some(0));
    assert_eq!(date.second(), Some(0));

    let offset = date.offset().expect("offset should exist");
    assert_eq!(offset.sign(), Some(OffsetSign::Minus));
    assert_eq!(offset.hours(), 5);
    assert_eq!(offset.minutes(), 30);
    assert!(!offset.is_utc());
    assert_eq!(offset.total_offset_minutes(), -330);
}
