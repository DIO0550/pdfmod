use super::parse_stream;

#[test]
fn parse_stream_object_returns_stream_for_lf_eol_with_length_four() {
    // 正常系（LF）: /Length 4 と data="data" の間が LF で区切られたストリームが復元されることを確認する（DC-10）
    let input = b"<< /Length 4 >>\nstream\ndata\nendstream";
    let stream = parse_stream(input);
    assert_eq!(stream.data(), b"data");
}

#[test]
fn parse_stream_object_returns_stream_for_crlf_eol_with_length_four() {
    // 正常系（CRLF）: stream キーワード直後の CRLF を 2 バイトの 1 改行として扱い data を切り出せることを確認する（DC-11: 1 パターン = 1 test）
    let input = b"<< /Length 4 >>\nstream\r\ndata\r\nendstream";
    let stream = parse_stream(input);
    assert_eq!(stream.data(), b"data");
}

#[test]
fn parse_stream_object_returns_empty_data_for_length_zero() {
    // 境界値: /Length 0 の場合 take_bytes(0) が空 slice を返し、Vec::new() で保持されることを確認する
    let input = b"<< /Length 0 >>\nstream\n\nendstream";
    let stream = parse_stream(input);
    assert!(stream.data().is_empty());
}
