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
fn parse_stream_object_returns_empty_data_for_length_zero_without_extra_blank_line() {
    // 境界値: /Length 0 で `stream\nendstream` のように post-stream EOL が pre-endstream EOL を
    // 兼ねる最小形が受理されることを確認する（Copilot 指摘対応: 余分な空行を要求しない）。
    // take_bytes(0) が空 slice を返し、Vec::new() で保持される。
    let input = b"<< /Length 0 >>\nstream\nendstream";
    let stream = parse_stream(input);
    assert!(stream.data().is_empty());
}

#[test]
fn parse_stream_object_returns_empty_data_for_length_zero_with_extra_blank_line() {
    // 境界値: /Length 0 で `stream\n\nendstream` のように data の代わりに追加の EOL がある形も受理されることを確認する。
    // 1 個目の EOL は consume_stream_eol、2 個目の EOL は expect_endstream の前置 EOL 消費で扱われる。
    let input = b"<< /Length 0 >>\nstream\n\nendstream";
    let stream = parse_stream(input);
    assert!(stream.data().is_empty());
}

#[test]
fn parse_stream_object_returns_stream_for_cr_only_eol_before_endstream() {
    // ISO 32000-1 §7.2.3 の EOL 定義は LF / CR / CRLF の 3 パターンをすべて許容する。
    // data の末尾に CR 単体（`data\rendstream`）が来る形も endstream 前 EOL として受理する
    // （Copilot 指摘対応: CR-only を寛容に扱う）。
    let input = b"<< /Length 4 >>\nstream\ndata\rendstream";
    let stream = parse_stream(input);
    assert_eq!(stream.data(), b"data");
}
