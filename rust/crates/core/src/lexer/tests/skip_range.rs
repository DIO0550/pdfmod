use crate::lexer::skip::{comment_body_end, skip_whitespace, skip_whitespace_and_comments};

#[test]
fn skip_whitespace_stops_at_regular_byte() {
    // 走査範囲の内側でホワイトスペースだけを読み飛ばすことを確認する
    let input = b"  abc";
    assert_eq!(skip_whitespace(input, 0, input.len()), 2);
}

#[test]
fn skip_whitespace_stops_at_end_bound() {
    // 終端を越えてホワイトスペースを読み進めないことを確認する
    let input = b"     ";
    assert_eq!(skip_whitespace(input, 0, 2), 2);
}

#[test]
fn skip_whitespace_and_comments_skips_alternating_sequence() {
    // 空白とコメントが交互に続く並びを最後まで読み飛ばすことを確認する
    let input = b" %a\n %b\n X";
    let stop = skip_whitespace_and_comments(input, 0, input.len());
    assert_eq!(input.get(stop), Some(&b'X'));
}

#[test]
fn skip_whitespace_and_comments_stops_at_end_bound_inside_comment() {
    // コメントの途中に終端がある場合、終端で止まることを確認する
    let input = b"%comment\nX";
    assert_eq!(skip_whitespace_and_comments(input, 0, 4), 4);
}

#[test]
fn skip_whitespace_and_comments_stops_at_delimiter_other_than_percent() {
    // `%` 以外のデリミタはコメント開始ではないため、その位置で止まることを確認する
    let input = b"   (";
    let stop = skip_whitespace_and_comments(input, 0, input.len());
    assert_eq!(input.get(stop), Some(&b'('));
}

#[test]
fn skip_whitespace_and_comments_is_noop_for_empty_range() {
    // 空の走査範囲では位置を動かさず panic しないことを確認する
    assert_eq!(skip_whitespace_and_comments(b"", 0, 0), 0);
    assert_eq!(skip_whitespace_and_comments(b"  ", 2, 2), 2);
}

#[test]
fn comment_body_end_stops_before_eol() {
    // コメント本文の終端が EOL の直前になる（EOL 自体は消費しない）ことを確認する
    let input = b"%comment\nX";
    assert_eq!(comment_body_end(input, 0, input.len()), 8);
}

#[test]
fn comment_body_end_stops_at_end_bound_without_eol() {
    // EOL の無いコメントでは走査範囲の終端で止まることを確認する
    let input = b"%trailing_without_eol";
    assert_eq!(comment_body_end(input, 0, input.len()), input.len());
}
