//! LZ77 の出力側。RFC 1951 §3.2.3 / §3.2.5 に対応する。
//!
//! 展開結果の `Vec<u8>` そのものをスライディングウィンドウとして扱う型（[`Window`]）と、
//! 後方参照を表す [`Distance`] / [`Length`] を提供する。
//! 別に 32KB のリングバッファを持たないのは、本実装が展開結果を全量保持して返すため。

use crate::byte_offset::ByteOffset;
use crate::filter::error::FlateError;
use crate::filter::flate::bit_reader::BitReader;
use crate::filter::flate::symbols::{
    DISTANCE_BASE, DISTANCE_EXTRA_BITS, LENGTH_BASE, LENGTH_EXTRA_BITS, MAX_DISTANCE,
};

/// 長さシンボルの最小値（RFC 1951 §3.2.5 の表は 257 から始まる）。
const FIRST_LENGTH_SYMBOL: usize = 257;

/// 後方参照のコピー長（RFC 1951 §3.2.5 の表で 3..=258）。
///
/// [`Distance`] と取り違えないための newtype。どちらも裸の `usize` だと
/// `copy_match(3, 258)` と `copy_match(258, 3)` が両方コンパイルを通ってしまう。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
#[must_use]
pub struct Length(usize);

impl Length {
    /// バイト数から直接組み立てる。
    ///
    /// 本番の構築経路は [`Self::read`] だけ（コピー長はビットストリームからしか生まれない）で、
    /// これは境界値をテストから組み立てるための入口。
    #[cfg(test)]
    pub fn new(value: usize) -> Self {
        Self(value)
    }

    /// 長さシンボル（257..=285）と、それに続く追加ビットからコピー長を読み取る。
    ///
    /// # Errors
    ///
    /// シンボルが 257..=285 の範囲外なら [`FlateErrorKind::InvalidLengthSymbol`]。
    /// 追加ビットの途中で入力が尽きたら `UnexpectedEof`。
    ///
    /// [`FlateErrorKind::InvalidLengthSymbol`]: crate::filter::error::FlateErrorKind::InvalidLengthSymbol
    pub fn read(reader: &mut BitReader<'_>, symbol: u16) -> Result<Self, FlateError> {
        let index = usize::from(symbol)
            .checked_sub(FIRST_LENGTH_SYMBOL)
            .ok_or_else(|| FlateError::invalid_length_symbol_at(reader.position(), symbol))?;
        let base = LENGTH_BASE
            .get(index)
            .copied()
            .ok_or_else(|| FlateError::invalid_length_symbol_at(reader.position(), symbol))?;
        let extra_bits = LENGTH_EXTRA_BITS.get(index).copied().unwrap_or(0);
        let extra = reader.read_bits(extra_bits)?;
        Ok(Self(
            usize::from(base).saturating_add(usize::try_from(extra).unwrap_or(0)),
        ))
    }

    /// コピー長をバイト数として取り出す。
    #[must_use]
    pub fn value(self) -> usize {
        self.0
    }
}

/// 後方参照の距離（RFC 1951 §3.2.5 の表で 1..=32768）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
#[must_use]
pub struct Distance(usize);

impl Distance {
    /// バイト数から直接組み立てる。
    ///
    /// 「出力長以下」「32768 以下」の検証は、参照先の有無を知っている
    /// [`Window::copy_match`] が行う。本番の構築経路は [`Self::read`] だけで、
    /// これは境界値をテストから組み立てるための入口。
    #[cfg(test)]
    pub fn new(value: usize) -> Self {
        Self(value)
    }

    /// 距離シンボル（0..=29）と、それに続く追加ビットから距離を読み取る。
    ///
    /// # Errors
    ///
    /// シンボルが 0..=29 の範囲外なら [`FlateErrorKind::InvalidDistanceSymbol`]。
    /// 追加ビットの途中で入力が尽きたら `UnexpectedEof`。
    ///
    /// [`FlateErrorKind::InvalidDistanceSymbol`]: crate::filter::error::FlateErrorKind::InvalidDistanceSymbol
    pub fn read(reader: &mut BitReader<'_>, symbol: u16) -> Result<Self, FlateError> {
        let index = usize::from(symbol);
        let base = DISTANCE_BASE
            .get(index)
            .copied()
            .ok_or_else(|| FlateError::invalid_distance_symbol_at(reader.position(), symbol))?;
        let extra_bits = DISTANCE_EXTRA_BITS.get(index).copied().unwrap_or(0);
        let extra = reader.read_bits(extra_bits)?;
        Ok(Self(
            usize::from(base).saturating_add(usize::try_from(extra).unwrap_or(0)),
        ))
    }

    /// 距離をバイト数として取り出す。
    #[must_use]
    pub fn value(self) -> usize {
        self.0
    }
}

/// 展開結果を蓄えるバッファ。同時に LZ77 のスライディングウィンドウでもある。
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Window {
    /// これまでに展開したバイト列。後方参照はこの中を遡って参照する。
    bytes: Vec<u8>,
}

impl Window {
    /// 空のウィンドウを作る。
    pub fn new() -> Self {
        Self { bytes: Vec::new() }
    }

    /// リテラル 1 バイトを書き出す。
    pub fn push_literal(&mut self, byte: u8) {
        self.bytes.push(byte);
    }

    /// 非圧縮ブロックのバイト列をそのまま書き出す。
    pub fn extend_from_slice(&mut self, data: &[u8]) {
        self.bytes.extend_from_slice(data);
    }

    /// 後方参照（`distance` と `length` の組）を複製して末尾へ追記する。
    ///
    /// # Errors
    ///
    /// 距離が 0、展開済みバイト数を超える、または 32768 を超える場合は
    /// [`FlateErrorKind::DistanceTooFar`]。
    ///
    /// # panic
    ///
    /// panic しない契約（添字アクセスを使わない）。
    ///
    /// [`FlateErrorKind::DistanceTooFar`]: crate::filter::error::FlateErrorKind::DistanceTooFar
    pub fn copy_match(
        &mut self,
        distance: Distance,
        length: Length,
        position: ByteOffset,
    ) -> Result<(), FlateError> {
        let available = self.bytes.len();
        let distance_value = distance.value();
        let length_value = length.value();
        if distance_value == 0 || distance_value > available || distance_value > MAX_DISTANCE {
            return Err(FlateError::distance_too_far_at(
                position,
                distance_value,
                available,
            ));
        }

        let start = available - distance_value;
        let end = start.saturating_add(length_value);
        // 参照範囲が既存の出力に収まる（length <= distance）なら、書きながら読み直す必要が
        // ないので一括で複製する。範囲が出力長を超えないことを end で明示的に確かめてから
        // 呼ぶ（extend_from_within は範囲外で panic するため、条件を外部の証明に頼らない）。
        if length_value <= distance_value && end <= available {
            self.bytes.extend_from_within(start..end);
            return Ok(());
        }

        // 重なりコピー（length > distance）では push したばかりのバイトを読み直すため、
        // 範囲を先に切り出さず 1 バイトずつ「読んで追記する」を繰り返す。
        for source in (start..).take(length_value) {
            let byte = self.bytes.get(source).copied().ok_or_else(|| {
                FlateError::distance_too_far_at(position, distance_value, available)
            })?;
            self.bytes.push(byte);
        }
        Ok(())
    }

    /// 展開結果のバイト列を取り出す。
    #[must_use]
    pub fn into_bytes(self) -> Vec<u8> {
        self.bytes
    }
}

#[cfg(test)]
mod tests;
