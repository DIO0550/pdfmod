//! ISO 32000-1:2008 §7.6.2 で使われる旧形式 PDF 互換用の RC4。

const MIN_KEY_LEN: usize = 5;
const MAX_KEY_LEN: usize = 16;
const STATE_LEN: usize = 256;

/// 5〜16 バイトの鍵で初期化された RC4 の状態。`i` と `j` は置換表の有効な添字。
pub(super) struct Rc4 {
    permutation: [u8; STATE_LEN],
    i: u8,
    j: u8,
}

impl Rc4 {
    /// 鍵スケジューリング (KSA) を行う。鍵が 5〜16 バイトの範囲外なら `None`。
    pub(super) fn new(key: &[u8]) -> Option<Self> {
        if !(MIN_KEY_LEN..=MAX_KEY_LEN).contains(&key.len()) {
            return None;
        }

        let mut permutation = [0; STATE_LEN];
        for (slot, value) in permutation.iter_mut().zip(0..=u8::MAX) {
            *slot = value;
        }

        let mut j = 0_u8;
        for (i, &key_byte) in (0..STATE_LEN).zip(key.iter().cycle()) {
            j = j.wrapping_add(permutation[i]).wrapping_add(key_byte);
            permutation.swap(i, usize::from(j));
        }

        // PRGA の添字は KSA の最終値にかかわらず 0 から始まる。
        Some(Self {
            permutation,
            i: 0,
            j: 0,
        })
    }

    /// PRGA の鍵ストリームをデータに XOR する。暗号化と復号は同じ操作で、
    /// 同じ鍵から新しく初期化すれば元に戻る。次の呼び出しは続きから処理する。
    pub(super) fn apply(&mut self, data: &mut [u8]) {
        for byte in data {
            self.i = self.i.wrapping_add(1);
            let i = usize::from(self.i);
            self.j = self.j.wrapping_add(self.permutation[i]);
            let j = usize::from(self.j);
            self.permutation.swap(i, j);

            let index = self.permutation[i].wrapping_add(self.permutation[j]);
            *byte ^= self.permutation[usize::from(index)];
        }
    }
}

#[cfg(test)]
mod tests;
