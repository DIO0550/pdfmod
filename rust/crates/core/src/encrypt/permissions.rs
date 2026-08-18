//! アクセス権限フラグ `/P`（ISO 32000-1:2008 §7.6.3.2 表 22、
//! `docs/specs/02b_encryption.md` §5）。
//!
//! ビット位置は表 22 の表記に合わせて 1 起点で数える。ビット 1-2 と 7-8 は予約。

use crate::byte_offset::ByteOffset;
use crate::encrypt::error::EncryptError;

/// アクセス権限フラグ。ビットが 1 のとき許可、0 のとき禁止。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[must_use]
pub struct Permissions(i32);

impl Permissions {
    /// 生のビットパターンから作る。
    pub fn from_bits(bits: i32) -> Self {
        Self(bits)
    }

    /// `/P` の整数値から作る。
    ///
    /// ISO 32000-1 表 21 は `/P` を符号付き 32 ビット整数と定めるが、
    /// 実在の PDF には符号なし表記（例: `4294967292`）で書くものがある。
    /// ビットパターンが同じであれば復号側の解釈は変わらないため、
    /// 符号なし 32 ビットに収まる値も受け入れる（#604）。
    ///
    /// # Errors
    ///
    /// どちらの 32 ビット表現にも収まらない場合は
    /// [`EncryptErrorKind::InvalidPermissions`]。
    ///
    /// [`EncryptErrorKind::InvalidPermissions`]: crate::encrypt::error::EncryptErrorKind::InvalidPermissions
    pub fn from_integer(value: i64, position: ByteOffset) -> Result<Self, EncryptError> {
        if let Ok(bits) = i32::try_from(value) {
            return Ok(Self(bits));
        }
        if let Ok(bits) = u32::try_from(value) {
            return Ok(Self(bits as i32));
        }
        Err(EncryptError::invalid_permissions_at(position, value))
    }

    /// 生のビットパターンを返す。
    #[must_use]
    pub fn bits(self) -> i32 {
        self.0
    }

    /// 指定ビット（1 起点）が立っているかを返す。
    fn has_bit(self, bit: u32) -> bool {
        self.0 & (1_i32 << (bit - 1)) != 0
    }

    /// ビット 3: 印刷（`/R 3` 以上では低解像度印刷）。
    #[must_use]
    pub fn print(self) -> bool {
        self.has_bit(3)
    }

    /// ビット 4: 内容の変更。
    #[must_use]
    pub fn modify_contents(self) -> bool {
        self.has_bit(4)
    }

    /// ビット 5: テキスト・グラフィックスの抽出。
    #[must_use]
    pub fn copy(self) -> bool {
        self.has_bit(5)
    }

    /// ビット 6: 注釈の追加・変更、フォームフィールドの記入。
    #[must_use]
    pub fn modify_annotations(self) -> bool {
        self.has_bit(6)
    }

    /// ビット 9: フォームフィールドの記入（`/R 3` 以上）。
    #[must_use]
    pub fn fill_forms(self) -> bool {
        self.has_bit(9)
    }

    /// ビット 10: アクセシビリティ目的の抽出（ISO 32000-2 で非推奨）。
    #[must_use]
    pub fn extract_for_accessibility(self) -> bool {
        self.has_bit(10)
    }

    /// ビット 11: 文書の組み立て（ページの挿入・回転・削除）。
    #[must_use]
    pub fn assemble(self) -> bool {
        self.has_bit(11)
    }

    /// ビット 12: 高解像度での印刷（`/R 3` 以上）。
    #[must_use]
    pub fn print_high_quality(self) -> bool {
        self.has_bit(12)
    }
}

#[cfg(test)]
mod tests {
    use super::Permissions;
    use crate::byte_offset::ByteOffset;
    use crate::encrypt::error::EncryptErrorKind;

    /// テスト用の位置。値そのものに意味は無い。
    fn position() -> ByteOffset {
        ByteOffset::new(0)
    }

    /// 権限ビット（1 起点）と、それを読むアクセサの組。
    type BitAccessor = (u32, fn(Permissions) -> bool);

    // 各権限ビットが対応するアクセサだけを立てることを確認する
    #[test]
    fn each_bit_maps_to_its_own_accessor() {
        let cases: [BitAccessor; 8] = [
            (3, Permissions::print),
            (4, Permissions::modify_contents),
            (5, Permissions::copy),
            (6, Permissions::modify_annotations),
            (9, Permissions::fill_forms),
            (10, Permissions::extract_for_accessibility),
            (11, Permissions::assemble),
            (12, Permissions::print_high_quality),
        ];
        for (bit, accessor) in cases {
            let permissions = Permissions::from_bits(1_i32 << (bit - 1));
            assert!(accessor(permissions), "bit {bit} should be granted");

            for (other_bit, other_accessor) in cases {
                if other_bit == bit {
                    continue;
                }
                assert!(
                    !other_accessor(permissions),
                    "bit {other_bit} should stay denied while only bit {bit} is set"
                );
            }
        }
    }

    // 符号付き表記の /P がビットパターンをそのまま保持することを確認する
    #[test]
    fn from_integer_keeps_signed_bit_pattern() {
        let permissions = Permissions::from_integer(-3904, position()).expect("-3904 should fit");

        assert_eq!(permissions.bits(), -3904);
        assert!(!permissions.print());
        assert!(!permissions.copy());
        assert!(!permissions.print_high_quality());
    }

    // 符号なし表記の /P が同じビットパターンの符号付き値になることを確認する
    #[test]
    fn from_integer_accepts_unsigned_notation() {
        let permissions =
            Permissions::from_integer(4_294_967_292, position()).expect("u32 range should fit");

        assert_eq!(permissions.bits(), -4);
        assert_eq!(permissions, Permissions::from_bits(-4));
    }

    // 32 ビットに収まらない /P が InvalidPermissions になることを確認する
    #[test]
    fn from_integer_rejects_values_beyond_32_bits() {
        let error = Permissions::from_integer(i64::MAX, position())
            .expect_err("i64::MAX should not fit in 32 bits");

        assert_eq!(
            error.kind(),
            &EncryptErrorKind::InvalidPermissions { value: i64::MAX }
        );
    }
}
