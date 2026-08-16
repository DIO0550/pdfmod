mod encrypt;
mod id_array;
mod keyword;
mod malformed;
mod optional_keys;
mod required_keys;
mod terminator;
mod unknown_keys;

/// トレイラのバイト列を組み立てる。
///
/// `body` には `"/Size 6 /Root 1 0 R"` のように辞書の中身だけを書き、
/// `separator` で `trailer` キーワードと `<<` の間の文字列
/// （`"\n"` / `" "` / `"\r\n"` / `"\n%comment\n"` など）を切り替える。
pub(super) fn trailer(body: &str, separator: &str) -> Vec<u8> {
    format!("trailer{separator}<< {body} >>").into_bytes()
}

/// 標準的な区切り（改行）でトレイラのバイト列を組み立てる。
pub(super) fn simple_trailer(body: &str) -> Vec<u8> {
    trailer(body, "\n")
}
