mod entry_layout;
mod keyword;
mod malformed;
mod multiple_subsections;
mod no_validation;
mod single_subsection;
mod terminator;
mod zero_entry;

/// xref テーブルのバイト列を組み立てる。
///
/// `subsections` は `(先頭オブジェクト番号, エントリ本体の並び)` のスライス。
/// エントリ本体は `"0000000000 65535 f"` のように EOL を含めずに書き、
/// `eol` で行末（`"\n"` / `"\r\n"` / `" \r\n"` / `"\r"`）を切り替える。
/// `tail` には `"trailer"` などテーブル直後に続く文字列を渡す。
pub(super) fn table(subsections: &[(u64, &[&str])], eol: &str, tail: &str) -> Vec<u8> {
    let mut text = String::from("xref\n");
    for (first_object, entries) in subsections {
        text.push_str(&format!("{first_object} {}\n", entries.len()));
        for entry in *entries {
            text.push_str(entry);
            text.push_str(eol);
        }
    }
    text.push_str(tail);
    text.into_bytes()
}
