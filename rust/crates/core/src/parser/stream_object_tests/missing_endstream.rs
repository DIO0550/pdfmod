use super::super::error::ParseErrorKind;
use super::parse_stream_err;

#[test]
fn parse_stream_object_returns_missing_endstream_when_name_token_follows_data() {
    // data 後に endstream ではなく Name トークンが来た場合、MissingEndstream を返すことを確認する
    let input = b"<< /Length 4 >>\nstream\ndata\n/Foo";
    let err = parse_stream_err(input);
    assert!(
        matches!(err.kind, ParseErrorKind::MissingEndstream),
        "expected MissingEndstream, got {:?}",
        err.kind
    );
}

#[test]
fn parse_stream_object_returns_missing_endstream_when_integer_token_follows_data() {
    // data 後に endstream ではなく Integer トークンが来た場合、MissingEndstream を返すことを確認する
    let input = b"<< /Length 4 >>\nstream\ndata\n42";
    let err = parse_stream_err(input);
    assert!(
        matches!(err.kind, ParseErrorKind::MissingEndstream),
        "expected MissingEndstream, got {:?}",
        err.kind
    );
}

#[test]
fn parse_stream_object_returns_missing_endstream_when_input_ends_before_endstream() {
    // data 後に endstream 前で EOF に達した場合、MissingEndstream を返すことを確認する
    // （実装計画 §4.1 / §9.3 に従い、EOF は UnexpectedEof ではなく MissingEndstream として扱う）
    let input = b"<< /Length 4 >>\nstream\ndata";
    let err = parse_stream_err(input);
    assert!(
        matches!(err.kind, ParseErrorKind::MissingEndstream),
        "expected MissingEndstream, got {:?}",
        err.kind
    );
}

#[test]
fn parse_stream_object_returns_missing_endstream_when_no_eol_before_endstream_keyword() {
    // ISO 32000-1 §7.3.8 は endstream 直前の EOL を必須とする。
    // data の直後に EOL 無しで endstream が続く入力は MissingEndstream として拒否されることを確認する。
    let input = b"<< /Length 4 >>\nstream\ndataendstream";
    let err = parse_stream_err(input);
    assert!(
        matches!(err.kind, ParseErrorKind::MissingEndstream),
        "expected MissingEndstream, got {:?}",
        err.kind
    );
}

#[test]
fn parse_stream_object_returns_missing_endstream_when_trailing_space_precedes_endstream() {
    // 末尾に空白 + EOL のパターン (data + " " + LF + endstream) は EOL 検証で失敗し、
    // MissingEndstream として拒否されることを確認する（skip_whitespace を経由しない厳格チェック）。
    let input = b"<< /Length 4 >>\nstream\ndata \nendstream";
    let err = parse_stream_err(input);
    assert!(
        matches!(err.kind, ParseErrorKind::MissingEndstream),
        "expected MissingEndstream, got {:?}",
        err.kind
    );
}

#[test]
fn parse_stream_object_returns_missing_endstream_when_space_between_eol_and_endstream() {
    // data + LF + 空白 + endstream のパターン。EOL 消費後に endstream キーワード直前で空白が混入していると
    // MissingEndstream として拒否されることを確認する（EOL 後の raw byte 一致で判定）。
    let input = b"<< /Length 4 >>\nstream\ndata\n endstream";
    let err = parse_stream_err(input);
    assert!(
        matches!(err.kind, ParseErrorKind::MissingEndstream),
        "expected MissingEndstream, got {:?}",
        err.kind
    );
}

#[test]
fn parse_stream_object_returns_missing_endstream_when_endstream_is_followed_by_regular_bytes() {
    // endstream の直後に regular byte (例: 42) が連続する場合、lexer は "endstream42" を Keyword として読むため
    // StreamEnd トークンにならず MissingEndstream として拒否されることを確認する（キーワード境界検証）。
    let input = b"<< /Length 4 >>\nstream\ndata\nendstream42";
    let err = parse_stream_err(input);
    assert!(
        matches!(err.kind, ParseErrorKind::MissingEndstream),
        "expected MissingEndstream, got {:?}",
        err.kind
    );
}

#[test]
fn parse_stream_object_returns_missing_endstream_when_length_includes_trailing_eol_byte() {
    // ISO 32000-1 §7.3.8 違反: /Length が data 末尾の LF バイトを "データとして" 数え込んでいるケース。
    // 例: /Length 4 で "abc\n" を data として指定し、直後に endstream が続く。cursor は 'e' を指し、
    // pos_after_data 位置に EOL が無いため MissingEndstream として拒否されることを確認する。
    // （Copilot 指摘対応: pos_after_data の EOL 必須化）
    let input = b"<< /Length 4 >>\nstream\nabc\nendstream";
    let err = parse_stream_err(input);
    assert!(
        matches!(err.kind, ParseErrorKind::MissingEndstream),
        "expected MissingEndstream, got {:?}",
        err.kind
    );
}
