use super::{parser, reference};

#[test]
fn parse_object_returns_reference_for_zero_zero_r() {
    // 境界値: N=0 / G=0 で Reference(0, 0) を返すことを確認する
    let mut p = parser(b"0 0 R");
    assert_eq!(p.parse_object(), Ok(reference(0, 0)));
}

#[test]
fn parse_object_returns_reference_for_i64_max_object_number() {
    // 境界値: N=i64::MAX が ObjectNumber(u64) に昇格して保持されることを確認する
    let mut p = parser(b"9223372036854775807 0 R");
    assert_eq!(p.parse_object(), Ok(reference(i64::MAX as u64, 0)));
}

#[test]
fn parse_object_returns_reference_for_u16_max_generation() {
    // 境界値: G=u16::MAX (=65535) で Reference(1, 65535) を返すことを確認する
    let mut p = parser(b"1 65535 R");
    assert_eq!(p.parse_object(), Ok(reference(1, u16::MAX)));
}
