use super::*;

// 重ならないコピー（距離 4・長さ 3）が該当範囲を複製することを確認する。
#[test]
fn non_overlapping_copy_duplicates_range() {
    let mut window = window_of(b"abcd");

    let result = window.copy_match(Distance::new(4), Length::new(3), ByteOffset::new(0));

    assert_eq!(result, Ok(()));
    assert_eq!(window.into_bytes(), b"abcdabc");
}

// 距離 1・長さ 5 の重なりコピーが直前のバイトを 5 回繰り返すことを確認する。
#[test]
fn overlapping_copy_repeats_last_byte() {
    let mut window = window_of(b"a");

    let result = window.copy_match(Distance::new(1), Length::new(5), ByteOffset::new(0));

    assert_eq!(result, Ok(()));
    assert_eq!(window.into_bytes(), b"aaaaaa");
}

// 距離 3・長さ 8 の重なりコピーが 3 バイトのパターンを循環させることを確認する。
#[test]
fn overlapping_copy_cycles_pattern() {
    let mut window = window_of(b"abc");

    let result = window.copy_match(Distance::new(3), Length::new(8), ByteOffset::new(0));

    assert_eq!(result, Ok(()));
    assert_eq!(window.into_bytes(), b"abcabcabcab");
}

// 長さが距離と等しい（重ならない最大長）コピーが一括複製経路で正しく動くことを確認する。
#[test]
fn copy_with_length_equal_to_distance_duplicates_whole_window() {
    let mut window = window_of(b"abcd");

    let result = window.copy_match(Distance::new(4), Length::new(4), ByteOffset::new(0));

    assert_eq!(result, Ok(()));
    assert_eq!(window.into_bytes(), b"abcdabcd");
}

// 長さが距離を 1 だけ超えるコピーが 1 バイトずつの経路へ切り替わることを確認する。
#[test]
fn copy_with_length_just_over_distance_wraps_into_new_bytes() {
    let mut window = window_of(b"abcd");

    let result = window.copy_match(Distance::new(4), Length::new(5), ByteOffset::new(0));

    assert_eq!(result, Ok(()));
    assert_eq!(window.into_bytes(), b"abcdabcda");
}

// 距離が展開済みバイト数ちょうど（先頭バイトを参照する）場合に成功することを確認する。
#[test]
fn distance_equal_to_window_length_succeeds() {
    let mut window = window_of(b"abc");

    let result = window.copy_match(Distance::new(3), Length::new(1), ByteOffset::new(0));

    assert_eq!(result, Ok(()));
    assert_eq!(window.into_bytes(), b"abca");
}

// 距離 32768 ちょうど（ウィンドウの上限）が成功することを確認する。
#[test]
fn distance_at_window_limit_succeeds() {
    let mut bytes = vec![0_u8; MAX_DISTANCE];
    bytes.iter_mut().take(1).for_each(|byte| *byte = b'x');
    let mut window = window_of(&bytes);

    let result = window.copy_match(
        Distance::new(MAX_DISTANCE),
        Length::new(1),
        ByteOffset::new(0),
    );

    assert_eq!(result, Ok(()));
    assert_eq!(window.into_bytes().last().copied(), Some(b'x'));
}

// 長さ 0 のコピーがウィンドウを変えずに成功することを確認する。
#[test]
fn zero_length_copy_leaves_window_unchanged() {
    let mut window = window_of(b"abc");

    let result = window.copy_match(Distance::new(1), Length::new(0), ByteOffset::new(0));

    assert_eq!(result, Ok(()));
    assert_eq!(window.into_bytes(), b"abc");
}

// 不正な距離（0・展開済み超過・ウィンドウ超過）が DistanceTooFar になることを確認する。
#[test]
fn invalid_distances_are_rejected() {
    let cases: [usize; 3] = [0, 4, MAX_DISTANCE + 1];

    for distance in cases {
        let mut window = window_of(b"abc");

        let result = window.copy_match(Distance::new(distance), Length::new(1), ByteOffset::new(9));

        assert_eq!(
            result,
            Err(FlateError::distance_too_far_at(
                ByteOffset::new(9),
                distance,
                3
            )),
            "distance {distance} should be rejected"
        );
        assert_eq!(
            window.into_bytes(),
            b"abc",
            "window should not change on error"
        );
    }
}
