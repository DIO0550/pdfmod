//! PDF の改行（EOL: LF / CR / CRLF）判定。
//!
//! ISO 32000 では LF 単体・CR 単体・CRLF の 3 パターンすべてを等価に 1 つの改行として
//! 扱わなければならない（CRLF を 2 つの改行として処理してはならない）。

/// 改行（EOL）の種類。
///
/// LF / CR / CRLF はいずれも等価に「1 つの改行」だが、占めるバイト数（`byte_len`）と
/// 種類が異なる。種類を保持するのは、stream キーワード直後の EOL 検証
/// （CRLF / LF のみ可・CR 単独不可）など、後続 parser で区別が必要になるため。
/// 軽量な分類タグとして `Copy` 可能。順序・ハッシュは用途上不要のため derive しない
/// （`PdfErrorCode` / `ByteKind` と同方針）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EolKind {
    /// LF（0x0A）単独の改行。
    Lf,
    /// CR（0x0D）単独の改行（直後に LF が続かない場合。バッファ末尾の CR を含む）。
    Cr,
    /// CRLF（0x0D 0x0A）。2 バイトで 1 つの改行。
    CrLf,
}

// 改行を構成するバイト（byte_kind モジュールとは依存させず、本ファイル内で完結させる）
const LF: u8 = 0x0A;
const CR: u8 = 0x0D;

impl EolKind {
    /// `data` の `pos` 位置が改行（EOL）であれば、その種類を返す関連関数。
    ///
    /// - LF（0x0A）: `Some(EolKind::Lf)`
    /// - CR（0x0D）で直後が LF: 1 つの改行として `Some(EolKind::CrLf)`
    /// - CR（0x0D）で直後が LF 以外（バッファ末尾の CR 含む）: `Some(EolKind::Cr)`
    /// - 改行ではないバイト・`pos` が範囲外（空バッファ含む）: `None`
    ///
    /// 境界チェックは `slice::get` で行い、いかなる入力でも panic しない純粋関数。
    /// 次バイト位置は `checked_add` で求め、`pos = usize::MAX` でもオーバーフローしない
    /// 意図をコード上で明示する（`data.get(pos)?` の先行ガードでも到達はしないが、
    /// 「任意 pos で panic しない」契約を局所的に自明にする）。
    /// 本関数は位置を進めない（消費しない）。進める量は戻り値の `byte_len` で得る。
    pub fn at(data: &[u8], pos: usize) -> Option<EolKind> {
        match *data.get(pos)? {
            LF => Some(EolKind::Lf),
            CR => match pos.checked_add(1).and_then(|next| data.get(next)) {
                Some(&LF) => Some(EolKind::CrLf),
                _ => Some(EolKind::Cr),
            },
            _ => None,
        }
    }

    /// この改行が占めるバイト数を返す（`Lf` / `Cr` = 1、`CrLf` = 2）。
    ///
    /// 呼び出し側はこの値だけ読み取り位置を進めることで、CRLF を 2 つの改行と
    /// 誤認せずに処理できる。メソッド名はコレクション長を示唆する `len` を避け、
    /// `byte_len` とする（clippy `len_without_is_empty` の誤検知も回避）。
    pub fn byte_len(&self) -> usize {
        match self {
            EolKind::CrLf => 2,
            EolKind::Lf | EolKind::Cr => 1,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn at_detects_lone_lf() {
        // [0x0A] の pos=0 が LF 単独の改行として Some(EolKind::Lf) を返すことを確認する
        assert_eq!(EolKind::at(&[0x0A], 0), Some(EolKind::Lf));
    }

    #[test]
    fn at_detects_lone_cr_followed_by_non_lf() {
        // [0x0D, b'x'] の pos=0 が CR 単独の改行として Some(EolKind::Cr) を返すことを確認する
        assert_eq!(EolKind::at(&[0x0D, b'x'], 0), Some(EolKind::Cr));
    }

    #[test]
    fn at_detects_crlf_as_single_eol() {
        // [0x0D, 0x0A] の pos=0 が 1 つの改行 CRLF として Some(EolKind::CrLf) を返すことを確認する
        assert_eq!(EolKind::at(&[0x0D, 0x0A], 0), Some(EolKind::CrLf));
    }

    #[test]
    fn at_works_at_mid_buffer_position() {
        // [b'a', 0x0D, 0x0A, b'b'] の pos=1 が Some(EolKind::CrLf) を返し、pos 引数が機能することを確認する
        assert_eq!(
            EolKind::at(&[b'a', 0x0D, 0x0A, b'b'], 1),
            Some(EolKind::CrLf)
        );
    }

    #[test]
    fn at_detects_lf_at_mid_buffer_position() {
        // [b'a', 0x0A, b'b'] の pos=1 が LF 単独として Some(EolKind::Lf) を返し、途中位置の正常系を確認する
        assert_eq!(EolKind::at(&[b'a', 0x0A, b'b'], 1), Some(EolKind::Lf));
    }

    #[test]
    fn at_detects_trailing_cr_at_buffer_end() {
        // [b'a', 0x0D] の pos=1（後続バイトなし）が単独 CR 扱いで Some(EolKind::Cr) を返し panic しないことを確認する
        assert_eq!(EolKind::at(&[b'a', 0x0D], 1), Some(EolKind::Cr));
    }

    #[test]
    fn at_returns_none_for_empty_buffer() {
        // 空バッファ [] の pos=0 は改行が存在しないため None を返すことを確認する
        assert_eq!(EolKind::at(&[], 0), None);
    }

    #[test]
    fn at_returns_none_for_out_of_range_pos() {
        // 範囲外 pos（len と同値 / len 超の通常値 / 極大値 usize::MAX）はいずれも None を返し panic しないことを確認する
        let data = [0x0A];
        assert_eq!(EolKind::at(&data, 1), None);
        assert_eq!(EolKind::at(&data, 2), None);
        assert_eq!(EolKind::at(&data, usize::MAX), None);
    }

    #[test]
    fn at_returns_none_for_non_eol_bytes() {
        // whitespace の SP/TAB/NUL/FF や regular バイト（b'a' 等）は改行ではないため None を返すことを確認する
        let non_eol_bytes = [0x20, 0x09, 0x00, 0x0C, b'a', b'0', 0xFF];
        for byte in non_eol_bytes {
            assert_eq!(
                EolKind::at(&[byte], 0),
                None,
                "0x{byte:02X} should not be an EOL"
            );
        }
    }

    #[test]
    fn at_treats_cr_cr_as_single_lone_cr() {
        // [0x0D, 0x0D] の pos=0 は先頭 CR のみを見て Some(EolKind::Cr)（CRLF と誤認しない）ことを確認する
        assert_eq!(EolKind::at(&[0x0D, 0x0D], 0), Some(EolKind::Cr));
    }

    #[test]
    fn at_treats_lf_cr_as_two_independent_eols() {
        // [0x0A, 0x0D] は pos=0 で Some(EolKind::Lf)、pos=1 で Some(EolKind::Cr)（2 つの独立した改行）であることを確認する
        let data = [0x0A, 0x0D];
        assert_eq!(EolKind::at(&data, 0), Some(EolKind::Lf));
        assert_eq!(EolKind::at(&data, 1), Some(EolKind::Cr));
    }

    #[test]
    fn at_does_not_merge_lf_lf() {
        // [0x0A, 0x0A] の pos=0 は Some(EolKind::Lf)（LFLF をまとめない）ことを確認する
        assert_eq!(EolKind::at(&[0x0A, 0x0A], 0), Some(EolKind::Lf));
    }

    #[test]
    fn at_inspects_only_given_position_for_crlf_second_byte() {
        // [0x0D, 0x0A] の pos=1（CRLF の 2 バイト目 LF を直接指す）は Some(EolKind::Lf) を返す
        // （at は指定位置だけを見る純粋判定。CRLF をまとめて飛ばす責務は呼び出し側の byte_len 利用にある）
        assert_eq!(EolKind::at(&[0x0D, 0x0A], 1), Some(EolKind::Lf));
    }

    #[test]
    fn byte_len_returns_consumed_byte_count() {
        // byte_len が Lf=1 / Cr=1 / CrLf=2 を返すことを確認する（消費バイト数の導出）
        let cases = [(EolKind::Lf, 1), (EolKind::Cr, 1), (EolKind::CrLf, 2)];
        for (kind, expected) in cases {
            assert_eq!(
                kind.byte_len(),
                expected,
                "{kind:?} byte_len should be {expected}"
            );
        }
    }

    #[test]
    fn all_distinct_variants_are_mutually_not_equal() {
        // 3 バリアントを総当たりで比較し、同一バリアントのみ等価・異なるバリアントは非等価であることを確認する
        let variants = [EolKind::Lf, EolKind::Cr, EolKind::CrLf];
        for (i, a) in variants.iter().enumerate() {
            for (j, b) in variants.iter().enumerate() {
                if i == j {
                    assert_eq!(a, b);
                } else {
                    assert_ne!(a, b);
                }
            }
        }
    }
}
