use super::*;
use crate::filter::error::FlateErrorKind;

mod dynamic;
mod fixed;
mod malformed;
mod multi_block;
mod stored;
mod window;
mod zlib_wrapper;

// 展開に成功する前提で結果のバイト列を取り出す。
fn decode_zlib_ok(input: &[u8]) -> Vec<u8> {
    decode_zlib(input).expect("valid zlib stream should decode")
}

// 展開に失敗する前提でエラー種別を取り出す。
fn decode_zlib_err(input: &[u8]) -> FlateErrorKind {
    decode_zlib(input)
        .expect_err("invalid zlib stream should fail")
        .kind
}
