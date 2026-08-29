//! LZ77 の後方参照コピー。RFC 1951 §3.2.3 に対応する。

use crate::byte_offset::ByteOffset;
use crate::filter::error::FlateError;
use crate::filter::flate::symbols::MAX_DISTANCE;

/// 出力の末尾から `distance` バイト遡った位置から `length` バイトを複製して追記する。
///
/// `length` が `distance` を超える場合（重なりコピー）、直前に書いたばかりのバイトを
/// 読み直す必要があるため、1 バイトずつコピーする。
///
/// # Errors
///
/// 距離が 0、出力済みバイト数を超える、または 32768 を超える場合は
/// [`FlateErrorKind::DistanceTooFar`]。
///
/// # panic
///
/// panic しない契約（添字アクセスを使わない）。
///
/// [`FlateErrorKind::DistanceTooFar`]: crate::filter::error::FlateErrorKind::DistanceTooFar
pub fn copy(
    output: &mut Vec<u8>,
    distance: usize,
    length: usize,
    position: ByteOffset,
) -> Result<(), FlateError> {
    let available = output.len();
    if distance == 0 || distance > available || distance > MAX_DISTANCE {
        return Err(FlateError::distance_too_far_at(
            position, distance, available,
        ));
    }

    let start = available - distance;
    let end = start.saturating_add(length);
    // 参照範囲が既存の出力に収まる（length <= distance）なら、書きながら読み直す必要が
    // ないので一括で複製する。範囲が出力長を超えないことを end で明示的に確かめてから
    // 呼ぶ（extend_from_within は範囲外で panic するため、条件を外部の証明に頼らない）。
    if length <= distance && end <= available {
        output.extend_from_within(start..end);
        return Ok(());
    }

    // 重なりコピー（length > distance）では push したばかりのバイトを読み直すため、
    // 範囲を先に切り出さず 1 バイトずつ「読んで追記する」を繰り返す。
    for source in (start..).take(length) {
        let byte = output
            .get(source)
            .copied()
            .ok_or_else(|| FlateError::distance_too_far_at(position, distance, available))?;
        output.push(byte);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // 重ならないコピー（距離 4・長さ 3）が該当範囲を複製することを確認する。
    #[test]
    fn non_overlapping_copy_duplicates_range() {
        let mut output = b"abcd".to_vec();

        assert_eq!(copy(&mut output, 4, 3, ByteOffset::new(0)), Ok(()));
        assert_eq!(output, b"abcdabc");
    }

    // 距離 1・長さ 5 の重なりコピーが直前のバイトを 5 回繰り返すことを確認する。
    #[test]
    fn overlapping_copy_repeats_last_byte() {
        let mut output = vec![b'a'];

        assert_eq!(copy(&mut output, 1, 5, ByteOffset::new(0)), Ok(()));
        assert_eq!(output, b"aaaaaa");
    }

    // 距離 3・長さ 8 の重なりコピーが 3 バイトのパターンを循環させることを確認する。
    #[test]
    fn overlapping_copy_cycles_pattern() {
        let mut output = b"abc".to_vec();

        assert_eq!(copy(&mut output, 3, 8, ByteOffset::new(0)), Ok(()));
        assert_eq!(output, b"abcabcabcab");
    }

    // 長さが距離と等しい（重ならない最大長）コピーが一括複製経路で正しく動くことを確認する。
    #[test]
    fn copy_with_length_equal_to_distance_duplicates_whole_window() {
        let mut output = b"abcd".to_vec();

        assert_eq!(copy(&mut output, 4, 4, ByteOffset::new(0)), Ok(()));
        assert_eq!(output, b"abcdabcd");
    }

    // 長さが距離を 1 だけ超えるコピーが 1 バイトずつの経路へ切り替わることを確認する。
    #[test]
    fn copy_with_length_just_over_distance_wraps_into_new_bytes() {
        let mut output = b"abcd".to_vec();

        assert_eq!(copy(&mut output, 4, 5, ByteOffset::new(0)), Ok(()));
        assert_eq!(output, b"abcdabcda");
    }

    // 距離が出力長ちょうど（先頭バイトを参照する）場合に成功することを確認する。
    #[test]
    fn distance_equal_to_output_length_succeeds() {
        let mut output = b"abc".to_vec();

        assert_eq!(copy(&mut output, 3, 1, ByteOffset::new(0)), Ok(()));
        assert_eq!(output, b"abca");
    }

    // 距離 32768 ちょうど（ウィンドウ上限）が成功することを確認する。
    #[test]
    fn distance_at_window_limit_succeeds() {
        let mut output = vec![0_u8; MAX_DISTANCE];
        output.iter_mut().take(1).for_each(|byte| *byte = b'x');

        assert_eq!(
            copy(&mut output, MAX_DISTANCE, 1, ByteOffset::new(0)),
            Ok(())
        );
        assert_eq!(output.last().copied(), Some(b'x'));
    }

    // 長さ 0 のコピーが出力を変えずに成功することを確認する。
    #[test]
    fn zero_length_copy_leaves_output_unchanged() {
        let mut output = b"abc".to_vec();

        assert_eq!(copy(&mut output, 1, 0, ByteOffset::new(0)), Ok(()));
        assert_eq!(output, b"abc");
    }

    // 不正な距離（0・出力長超過・ウィンドウ超過）が DistanceTooFar になることを確認する。
    #[test]
    fn invalid_distances_are_rejected() {
        let cases: [usize; 3] = [0, 4, MAX_DISTANCE + 1];

        for distance in cases {
            let mut output = b"abc".to_vec();

            assert_eq!(
                copy(&mut output, distance, 1, ByteOffset::new(9)),
                Err(FlateError::distance_too_far_at(
                    ByteOffset::new(9),
                    distance,
                    3
                )),
                "distance {distance} should be rejected"
            );
            assert_eq!(output, b"abc", "output should not change on error");
        }
    }
}
