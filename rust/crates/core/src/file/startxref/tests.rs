mod comment_handling;
mod eol_variants;
mod malformed_offset;
mod multiple_eof;
mod parse_basic;
mod scan_limit;
mod token_boundary;

/// 先頭にダミー本体、末尾に `startxref` / オフセット / `%%EOF` を並べたバイト列を作る。
///
/// `eol` に `"\n"` / `"\r\n"` / `"\r"` を渡して改行バリエーションを切り替える。
pub(super) fn tail(body: &str, offset: &str, eol: &str) -> Vec<u8> {
    format!("{body}{eol}startxref{eol}{offset}{eol}%%EOF{eol}").into_bytes()
}
