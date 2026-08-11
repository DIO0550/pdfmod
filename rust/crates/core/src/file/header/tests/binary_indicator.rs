use crate::file::header::PdfHeader;

fn has_indicator(input: &[u8]) -> bool {
    PdfHeader::parse(input)
        .expect("header should parse")
        .has_binary_indicator()
}

#[test]
fn has_binary_indicator_standard_line_returns_true() {
    // Acrobat 形式の高ビットバイト 4 個を持つコメント行を検出することを確認する
    assert!(has_indicator(b"%PDF-1.7\n%\xE2\xE3\xCF\xD3\n"));
}

#[test]
fn has_binary_indicator_missing_line_returns_false() {
    // インジケータがなくても解析でき false を返すことを確認する
    assert!(!has_indicator(b"%PDF-1.7\n1 0 obj\n"));
}

#[test]
fn has_binary_indicator_four_high_bytes_returns_true() {
    // 高ビットバイトが下限ちょうど 4 個なら true になることを確認する
    assert!(has_indicator(b"%PDF-1.7\n%\x80\x80\x80\x80\n"));
}

#[test]
fn has_binary_indicator_three_high_bytes_returns_false() {
    // 高ビットバイトが 3 個だけなら false になることを確認する
    assert!(!has_indicator(b"%PDF-1.7\n%\x80\x80\x80\n"));
}

#[test]
fn has_binary_indicator_ascii_comment_returns_false() {
    // ASCII のみの通常コメントをインジケータと誤認しないことを確認する
    assert!(!has_indicator(b"%PDF-1.7\n%Produced by X\n"));
}

#[test]
fn has_binary_indicator_header_without_eol_returns_false() {
    // ヘッダ行に EOL がなくても panic せず false になることを確認する
    assert!(!has_indicator(b"%PDF-1.7"));
}

#[test]
fn has_binary_indicator_eol_variants_returns_true() {
    // LF・CR・CRLF の各 EOL でインジケータを検出できることを確認する
    let inputs = [
        b"%PDF-1.7\n%\xE2\xE3\xCF\xD3\n".as_slice(),
        b"%PDF-1.7\r%\xE2\xE3\xCF\xD3\r",
        b"%PDF-1.7\r\n%\xE2\xE3\xCF\xD3\r\n",
    ];
    for input in inputs {
        assert!(has_indicator(input));
    }
}

#[test]
fn has_binary_indicator_empty_comment_returns_false() {
    // パーセント記号だけの空コメント行は false になることを確認する
    assert!(!has_indicator(b"%PDF-1.7\n%\n"));
}

#[test]
fn has_binary_indicator_indented_comment_returns_false() {
    // 行頭が空白でインデントされたコメントを検出しないことを確認する
    assert!(!has_indicator(b"%PDF-1.7\n %\xE2\xE3\xCF\xD3\n"));
}

#[test]
fn has_binary_indicator_after_empty_line_returns_false() {
    // 空行を挟んだ後方のコメント行を検出しないことを確認する
    assert!(!has_indicator(b"%PDF-1.7\n\n%\xE2\xE3\xCF\xD3\n"));
}

#[test]
fn has_binary_indicator_split_across_lines_returns_false() {
    // 高ビットバイトを複数行にまたがって合算しないことを確認する
    assert!(!has_indicator(b"%PDF-1.7\n%\x80\x80\n%\x80\x80\n"));
}

#[test]
fn has_binary_indicator_non_comment_line_returns_false() {
    // 高ビットバイトがあっても行頭がパーセントでなければ false になることを確認する
    assert!(!has_indicator(b"%PDF-1.7\n1 0 obj\x80\x80\x80\x80\n"));
}

#[test]
fn has_binary_indicator_line_without_eol_returns_true() {
    // インジケータ行が入力末尾まで続いても高ビットバイトを数えることを確認する
    assert!(has_indicator(b"%PDF-1.7\n%\xE2\xE3\xCF\xD3"));
}

#[test]
fn has_binary_indicator_space_before_eol_returns_true() {
    // 版の後の空白を跨いで次行のインジケータを検出することを確認する
    assert!(has_indicator(b"%PDF-1.7 \n%\xE2\xE3\xCF\xD3\n"));
}

#[test]
fn has_binary_indicator_word_before_eol_returns_false() {
    // 版の後に非空白語があれば次行探索を打ち切ることを確認する
    assert!(!has_indicator(b"%PDF-1.7 junk\n%\xE2\xE3\xCF\xD3\n"));
}
