//! 認証済みオブジェクト解決に固有の失敗。

use crate::encrypt::object_key::{DecryptError, ObjectKeyError};
use crate::resolver::error::ResolveError;

/// 認証済みの間接オブジェクト解決で発生する失敗。
#[derive(Debug, PartialEq)]
pub enum AuthenticatedResolveError {
    /// xref・構文・オブジェクト構造の解決に失敗した。
    Resolution(ResolveError),
    /// 認証結果が入力文書の `/Encrypt` または `/ID` に結び付いていない。
    AuthenticationMismatch,
    /// crypt filter の方式とファイル暗号鍵が両立しない。
    IncompatibleDecryption(ObjectKeyError),
    /// 文字列またはストリーム本体を復号できない。
    Decryption(DecryptError),
    /// 明示的な `/Crypt` または `/EFF` を必要とするストリーム。
    UnsupportedCryptFilter,
}

impl From<ResolveError> for AuthenticatedResolveError {
    fn from(error: ResolveError) -> Self {
        Self::Resolution(error)
    }
}
