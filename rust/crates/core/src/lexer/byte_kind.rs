//! PDF のバイト 3 分類（PDF lexical conventions の white-space characters /
//! delimiter characters。`docs/specs/01_lexical_conventions.md` §2）。

// white-space characters（§2.1 の 6 バイト）
const NUL: u8 = 0x00;
const TAB: u8 = 0x09;
const LF: u8 = 0x0A;
const FF: u8 = 0x0C;
const CR: u8 = 0x0D;
const SP: u8 = 0x20;

// delimiter characters（§2.2 の 10 バイト: ( ) < > [ ] { } / %）
const LEFT_PAREN: u8 = 0x28;
const RIGHT_PAREN: u8 = 0x29;
const LESS_THAN: u8 = 0x3C;
const GREATER_THAN: u8 = 0x3E;
const LEFT_BRACKET: u8 = 0x5B;
const RIGHT_BRACKET: u8 = 0x5D;
const LEFT_BRACE: u8 = 0x7B;
const RIGHT_BRACE: u8 = 0x7D;
const SLASH: u8 = 0x2F;
const PERCENT: u8 = 0x25;

/// PDF バイトの分類（ISO 32000 / `docs/specs/01_lexical_conventions.md` §2）。
///
/// 全バイト値（0x00〜0xFF）は whitespace / delimiter / regular のいずれか
/// ちょうど 1 つに排他的に分類される。
/// 軽量な分類タグとして `Copy` 可能。等価判定（`PartialEq`/`Eq`）は同一バリアントか
/// 否かに従う。順序・ハッシュは用途上不要のため derive しない（`PdfErrorCode` と同方針）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ByteKind {
    /// ホワイトスペース文字（NUL / TAB / LF / FF / CR / SP の 6 バイト）。
    Whitespace,
    /// デリミタ文字（`( ) < > [ ] { } / %` の 10 バイト）。
    Delimiter,
    /// 上記いずれにも該当しない通常の文字（トークンを構成する）。
    Regular,
}

impl ByteKind {
    /// バイト値を 3 分類のいずれかに分類する。
    ///
    /// 全バイト値に対して定義される全域関数であり、panic しない。
    pub fn classify(byte: u8) -> ByteKind {
        match byte {
            NUL | TAB | LF | FF | CR | SP => ByteKind::Whitespace,
            LEFT_PAREN | RIGHT_PAREN | LESS_THAN | GREATER_THAN | LEFT_BRACKET | RIGHT_BRACKET
            | LEFT_BRACE | RIGHT_BRACE | SLASH | PERCENT => ByteKind::Delimiter,
            _ => ByteKind::Regular,
        }
    }

    /// ホワイトスペースバイトかどうかを返す述語（関連関数）。
    ///
    /// 分類の単一情報源である `ByteKind::classify` に委譲する。
    pub fn is_whitespace(byte: u8) -> bool {
        ByteKind::classify(byte) == ByteKind::Whitespace
    }

    /// デリミタバイトかどうかを返す述語（関連関数）。
    ///
    /// 分類の単一情報源である `ByteKind::classify` に委譲する。
    pub fn is_delimiter(byte: u8) -> bool {
        ByteKind::classify(byte) == ByteKind::Delimiter
    }

    /// 通常の文字（whitespace でも delimiter でもない）かどうかを返す述語（関連関数）。
    ///
    /// 分類の単一情報源である `ByteKind::classify` に委譲する。
    pub fn is_regular(byte: u8) -> bool {
        ByteKind::classify(byte) == ByteKind::Regular
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_whitespace_bytes() {
        // 仕様 §2.1 の whitespace 6 バイト（NUL/TAB/LF/FF/CR/SP）がすべて Whitespace に分類されることを確認する
        let whitespace_bytes = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
        for byte in whitespace_bytes {
            assert_eq!(
                ByteKind::classify(byte),
                ByteKind::Whitespace,
                "0x{byte:02X} should be Whitespace"
            );
        }
    }

    #[test]
    fn classifies_delimiter_bytes() {
        // 仕様 §2.2 の delimiter 10 バイト（( ) < > [ ] { } / %）がすべて Delimiter に分類されることを確認する
        let delimiter_bytes = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
        for byte in delimiter_bytes {
            assert_eq!(
                ByteKind::classify(byte),
                ByteKind::Delimiter,
                "0x{byte:02X} should be Delimiter"
            );
        }
    }

    #[test]
    fn classifies_regular_representative_bytes() {
        // 英数字・キーワード構成バイト・非 ASCII（0x80, 0xFF）が Regular に分類されることを確認する
        let regular_bytes = [b'A', b'z', b'0', b'9', b't', b'n', 0x80, 0xFF];
        for byte in regular_bytes {
            assert_eq!(
                ByteKind::classify(byte),
                ByteKind::Regular,
                "0x{byte:02X} should be Regular"
            );
        }
    }

    #[test]
    fn classifies_boundary_adjacent_bytes_as_regular() {
        // whitespace / delimiter の隣接バイト（0x0B VT 含む）が Regular であることを確認する
        // （0x0B VT は ASCII では制御文字だが PDF では whitespace ではない）
        let adjacent_bytes = [
            0x01, 0x08, 0x0B, 0x0E, 0x1F, 0x21, 0x24, 0x26, 0x27, 0x2A, 0x2E, 0x30, 0x3B, 0x3D,
            0x3F, 0x5A, 0x5C, 0x5E, 0x7A, 0x7C, 0x7E,
        ];
        for byte in adjacent_bytes {
            assert_eq!(
                ByteKind::classify(byte),
                ByteKind::Regular,
                "0x{byte:02X} should be Regular"
            );
        }
    }

    #[test]
    fn classifies_all_256_bytes_exclusively() {
        // 全 256 バイト（0x00〜0xFF）を総当たりし、各バイトがちょうど 1 つの分類になり、
        // 件数が whitespace=6 / delimiter=10 / regular=240 であることを確認する
        let mut whitespace_count = 0;
        let mut delimiter_count = 0;
        let mut regular_count = 0;
        for byte in 0x00..=0xFFu8 {
            match ByteKind::classify(byte) {
                ByteKind::Whitespace => whitespace_count += 1,
                ByteKind::Delimiter => delimiter_count += 1,
                ByteKind::Regular => regular_count += 1,
            }
        }
        assert_eq!(whitespace_count, 6);
        assert_eq!(delimiter_count, 10);
        assert_eq!(regular_count, 240);
    }

    #[test]
    fn predicates_agree_with_classify_for_all_256_bytes() {
        // 全 256 バイトで述語 3 関数のうちちょうど 1 つだけ true になり、
        // その結果が classify の分類と一致することを確認する（委譲の整合性）
        for byte in 0x00..=0xFFu8 {
            let predicates = [
                ByteKind::is_whitespace(byte),
                ByteKind::is_delimiter(byte),
                ByteKind::is_regular(byte),
            ];
            let true_count = predicates.iter().filter(|&&p| p).count();
            assert_eq!(
                true_count, 1,
                "0x{byte:02X} should satisfy exactly one predicate"
            );
            let expected = match ByteKind::classify(byte) {
                ByteKind::Whitespace => [true, false, false],
                ByteKind::Delimiter => [false, true, false],
                ByteKind::Regular => [false, false, true],
            };
            assert_eq!(
                predicates, expected,
                "0x{byte:02X}: predicates should agree with classify"
            );
        }
    }

    #[test]
    fn predicates_return_true_only_for_matching_kind() {
        // 各分類の代表バイトに対し、対応する述語のみ true・他 2 述語が false を返すことを確認する
        // （expected は [is_whitespace, is_delimiter, is_regular] の順）
        let cases: [(u8, [bool; 3]); 3] = [
            (0x20, [true, false, false]), // SP は whitespace
            (0x28, [false, true, false]), // '(' は delimiter
            (b'A', [false, false, true]), // 'A' は regular
        ];
        for (byte, expected) in cases {
            let actual = [
                ByteKind::is_whitespace(byte),
                ByteKind::is_delimiter(byte),
                ByteKind::is_regular(byte),
            ];
            assert_eq!(actual, expected, "0x{byte:02X} predicates mismatch");
        }
    }

    #[test]
    fn all_distinct_variants_are_mutually_not_equal() {
        // 3 バリアントを総当たりで比較し、同一バリアントのみ等価・異なるバリアントは非等価であることを確認する
        let variants = [ByteKind::Whitespace, ByteKind::Delimiter, ByteKind::Regular];
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
