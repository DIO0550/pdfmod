//! AES のバイト置換と有限体 GF(2⁸) の演算（FIPS 197 §4・§5）。
//! 秘密値を表の添字に使わず、16 バイトそれぞれに同じ固定手順を適用する。

use super::Block;

const LOW_BITS: u128 = u128::from_le_bytes([1; 16]);

/// 16 個の独立した 8 ビットの体要素。各バイト境界を保って並列に計算する。
#[derive(Clone, Copy)]
struct ByteLanes(u128);

impl ByteLanes {
    fn substitute(self) -> Self {
        let x = self.inverse();
        Self(
            x.0 ^ x.rotate(1)
                ^ x.rotate(2)
                ^ x.rotate(3)
                ^ x.rotate(4)
                ^ u128::from_le_bytes([0x63; 16]),
        )
    }

    fn inverse_substitute(self) -> Self {
        let x = self.rotate(1) ^ self.rotate(3) ^ self.rotate(6) ^ u128::from_le_bytes([0x05; 16]);
        Self(x).inverse()
    }

    /// 各バイトを独立に左ローテートする。shift はアフィン変換の定数 (1〜6)。
    fn rotate(self, shift: u32) -> u128 {
        let low_mask = LOW_BITS * ((1 << shift) - 1);
        ((self.0 << shift) & !low_mask) | ((self.0 >> (8 - shift)) & low_mask)
    }

    /// 非ゼロの要素の逆数は x^254。ゼロにも同じ演算を行い、AES の規定どおりゼロを得る。
    fn inverse(self) -> Self {
        let x2 = self.square();
        let x3 = x2.multiply(self);
        let x12 = x3.square().square();
        let x15 = x12.multiply(x3);
        let x240 = x15.square().square().square().square();
        x240.multiply(x12).multiply(x2)
    }

    fn multiply(self, rhs: Self) -> Self {
        let mut a = self.0;
        let mut b = rhs.0;
        let mut product = 0;
        for _ in 0..8 {
            // 乗数の 1 ビットを各バイトの 00 / FF に広げ、分岐せず部分積を選ぶ。
            let mask = (b & LOW_BITS).wrapping_mul(0xff);
            product ^= a & mask;
            // x を掛けたときの桁上がりは、AES の多項式 0x11B で還元する。
            let carry = (a >> 7) & LOW_BITS;
            a = ((a << 1) & !LOW_BITS) ^ carry.wrapping_mul(0x1b);
            b >>= 1;
        }
        Self(product)
    }

    fn square(self) -> Self {
        // GF(2) では (a+b)² = a²+b²。各ビットの x^(2i) を 0x11B で還元して足す。
        let bit = |i: u32| (self.0 >> i) & LOW_BITS;
        Self(
            bit(0)
                ^ (bit(1) << 2)
                ^ (bit(2) << 4)
                ^ (bit(3) << 6)
                ^ bit(4).wrapping_mul(0x1b)
                ^ bit(5).wrapping_mul(0x6c)
                ^ bit(6).wrapping_mul(0xab)
                ^ bit(7).wrapping_mul(0x9a),
        )
    }
}

/// AES の SubBytes をブロック全体へ適用する。
pub(in crate::encrypt::aes) fn substitute(block: Block) -> Block {
    ByteLanes(u128::from_le_bytes(block))
        .substitute()
        .0
        .to_le_bytes()
}

/// AES の InvSubBytes をブロック全体へ適用する。
pub(in crate::encrypt::aes) fn inverse_substitute(block: Block) -> Block {
    ByteLanes(u128::from_le_bytes(block))
        .inverse_substitute()
        .0
        .to_le_bytes()
}

/// 鍵拡張の SubWord。下位 4 バイトに同じ正方向の置換を適用する。
pub(in crate::encrypt::aes) fn substitute_word(word: u32) -> u32 {
    let [a, b, c, d, ..] = ByteLanes(u128::from(word)).substitute().0.to_le_bytes();
    u32::from_le_bytes([a, b, c, d])
}

/// AES の有限体で 2 倍する。最上位ビットがあれば還元多項式の下位 8 ビットを XOR する。
pub(in crate::encrypt::aes) fn double(byte: u8) -> u8 {
    let reduction_mask = 0_u8.wrapping_sub(byte >> 7);
    (byte << 1) ^ (0x1b & reduction_mask)
}

#[cfg(test)]
mod tests;
