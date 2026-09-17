//! PDF `/DecodeParms` の予測関数（Predictor）逆適用。
//!
//! ISO 32000-1:2008 7.4.4.4 および RFC 2083 に基づき、FlateDecode / LZWDecode 展開後の
//! バイト列に対して TIFF Predictor 2（水平差分）および PNG 各種フィルタ（None, Sub, Up, Average, Paeth）
//! の逆適用を行う。

pub mod colors;
pub mod columns;
pub mod key;

pub use colors::Colors;
pub use columns::Columns;
pub use key::DecodeParmsKey;

use std::num::NonZeroUsize;

use crate::byte_offset::ByteOffset;
use crate::filter::error::FlateError;
use crate::object::dictionary::PdfDictionary;

/// 1行あたりの生データ長（タグバイトを除くバイト数）。
///
/// `Colors * Columns * (BitsPerComponent / 8)`（現スコープでは 8bit 固定のため `Colors * Columns`）。
/// 0 を型レベルで排除する newtype。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RowBytes(pub(crate) NonZeroUsize);

impl RowBytes {
    /// 指定された [`NonZeroUsize`] から [`RowBytes`] を構築する。
    #[inline]
    #[must_use]
    pub const fn new(value: NonZeroUsize) -> Self {
        Self(value)
    }

    /// `usize` 値から [`RowBytes`] を構築する。`0` の場合は `None` を返す。
    #[inline]
    #[must_use]
    pub const fn from_usize(value: usize) -> Option<Self> {
        match NonZeroUsize::new(value) {
            Some(nz) => Some(Self(nz)),
            None => None,
        }
    }

    /// `colors` と `columns` から計算して構築する。乗算オーバーフロー時はエラー。
    pub fn compute(
        colors: Colors,
        columns: Columns,
        position: ByteOffset,
    ) -> Result<Self, FlateError> {
        let val = colors
            .get()
            .get()
            .checked_mul(columns.get().get())
            .ok_or_else(|| FlateError::predictor_parameter_overflow_at(position))?;
        let nz = NonZeroUsize::new(val)
            .ok_or_else(|| FlateError::predictor_parameter_overflow_at(position))?;
        Ok(Self(nz))
    }

    /// 保持する [`NonZeroUsize`] 値を取得する。
    #[inline]
    #[must_use]
    pub const fn get(self) -> NonZeroUsize {
        self.0
    }

    /// バイト長を `usize` として取得する。
    #[inline]
    #[must_use]
    pub const fn as_usize(self) -> usize {
        self.0.get()
    }
}

/// PNG フィルタタグ（1バイト）を含む1行あたりのレコードサイズ（バイト数）。
///
/// `RowBytes + 1`。0 を型レベルで排除する newtype。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RecordSize(pub(crate) NonZeroUsize);

impl RecordSize {
    /// 指定された [`NonZeroUsize`] から [`RecordSize`] を構築する。
    #[inline]
    #[must_use]
    pub const fn new(value: NonZeroUsize) -> Self {
        Self(value)
    }

    /// `usize` 値から [`RecordSize`] を構築する。`0` の場合は `None` を返す。
    #[inline]
    #[must_use]
    pub const fn from_usize(value: usize) -> Option<Self> {
        match NonZeroUsize::new(value) {
            Some(nz) => Some(Self(nz)),
            None => None,
        }
    }

    /// [`RowBytes`] にタグ 1 バイトを加算して構築する。加算オーバーフロー時はエラー。
    pub fn from_row_bytes(row_bytes: RowBytes, position: ByteOffset) -> Result<Self, FlateError> {
        let val = row_bytes
            .as_usize()
            .checked_add(1)
            .ok_or_else(|| FlateError::predictor_parameter_overflow_at(position))?;
        let nz = NonZeroUsize::new(val)
            .ok_or_else(|| FlateError::predictor_parameter_overflow_at(position))?;
        Ok(Self(nz))
    }

    /// 保持する [`NonZeroUsize`] 値を取得する。
    #[inline]
    #[must_use]
    pub const fn get(self) -> NonZeroUsize {
        self.0
    }

    /// レコード長を `usize` として取得する。
    #[inline]
    #[must_use]
    pub const fn as_usize(self) -> usize {
        self.0.get()
    }
}

/// 行番号を表す newtype（0始まり）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RowIndex(pub(crate) usize);

impl RowIndex {
    /// 指定された行番号から [`RowIndex`] を構築する。
    #[inline]
    #[must_use]
    pub const fn new(value: usize) -> Self {
        Self(value)
    }

    /// 行番号を `usize` として取得する。
    #[inline]
    #[must_use]
    pub const fn get(self) -> usize {
        self.0
    }
}

/// 1コンポーネントあたりのビット数。
///
/// 現スコープでは 8 ビットのみをサポートする（ISO 32000-1 7.4.4.4）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum BitsPerComponent {
    /// 8 ビット/コンポーネント。
    Eight,
}

impl BitsPerComponent {
    /// `i64` 値として返す（常に 8）。
    #[inline]
    #[must_use]
    pub const fn as_i64(self) -> i64 {
        match self {
            Self::Eight => 8,
        }
    }

    /// `usize` 値として返す（常に 8）。
    #[inline]
    #[must_use]
    pub const fn as_usize(self) -> usize {
        match self {
            Self::Eight => 8,
        }
    }

    /// `i64` 値から変換する。8 以外はエラー。
    pub fn from_i64_at(value: i64, position: ByteOffset) -> Result<Self, FlateError> {
        match value {
            8 => Ok(Self::Eight),
            actual => Err(FlateError::unsupported_bits_per_component_at(
                position, actual,
            )),
        }
    }
}

/// PNG 予測子の行フィルタタグ（各行先頭の 1 バイト）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PngFilterTag {
    /// フィルタなし（差分なし）。
    None = 0,
    /// 同一行の左ピクセルとの差分。
    Sub = 1,
    /// 直上行のピクセルとの差分。
    Up = 2,
    /// 左と直上の平均との差分。
    Average = 3,
    /// Paeth 予測アルゴリズムによる差分。
    Paeth = 4,
}

impl PngFilterTag {
    /// `u8` のタグバイトを行番号・位置と共に検証・変換する。
    pub(crate) fn from_u8(
        tag: u8,
        row: RowIndex,
        position: ByteOffset,
    ) -> Result<Self, FlateError> {
        match tag {
            0 => Ok(Self::None),
            1 => Ok(Self::Sub),
            2 => Ok(Self::Up),
            3 => Ok(Self::Average),
            4 => Ok(Self::Paeth),
            actual => Err(FlateError::invalid_png_filter_tag_at(
                position,
                actual,
                row.get(),
            )),
        }
    }
}

/// 予測アルゴリズムの種別（PDF 1.7 表 8）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PredictorAlgorithm {
    /// 予測関数なし（入力そのまま）。
    None,
    /// TIFF Predictor 2（水平差分）。
    Tiff2,
    /// PNG None（タグ 0）。
    PngNone,
    /// PNG Sub（タグ 1）。
    PngSub,
    /// PNG Up（タグ 2）。
    PngUp,
    /// PNG Average（タグ 3）。
    PngAverage,
    /// PNG Paeth（タグ 4）。
    PngPaeth,
    /// PNG Optimum（行ごとに最適なタグを選択）。
    PngOptimum,
}

impl PredictorAlgorithm {
    /// PDF 仕様上の数値表現（`1..=15`）を返す。
    #[inline]
    #[must_use]
    pub const fn as_i64(self) -> i64 {
        match self {
            Self::None => 1,
            Self::Tiff2 => 2,
            Self::PngNone => 10,
            Self::PngSub => 11,
            Self::PngUp => 12,
            Self::PngAverage => 13,
            Self::PngPaeth => 14,
            Self::PngOptimum => 15,
        }
    }

    /// 数値表現から変換する。サポート外の数値はエラー。
    pub fn from_i64_at(value: i64, position: ByteOffset) -> Result<Self, FlateError> {
        match value {
            1 => Ok(Self::None),
            2 => Ok(Self::Tiff2),
            10 => Ok(Self::PngNone),
            11 => Ok(Self::PngSub),
            12 => Ok(Self::PngUp),
            13 => Ok(Self::PngAverage),
            14 => Ok(Self::PngPaeth),
            15 => Ok(Self::PngOptimum),
            actual => Err(FlateError::unsupported_predictor_at(position, actual)),
        }
    }

    /// PNG 系の予測子かどうかを返す。
    #[inline]
    #[must_use]
    pub const fn is_png(self) -> bool {
        matches!(
            self,
            Self::PngNone
                | Self::PngSub
                | Self::PngUp
                | Self::PngAverage
                | Self::PngPaeth
                | Self::PngOptimum
        )
    }

    /// TIFF 系の予測子かどうかを返す。
    #[inline]
    #[must_use]
    pub const fn is_tiff(self) -> bool {
        matches!(self, Self::Tiff2)
    }
}

/// `/DecodeParms` の Predictor 関連パラメータ。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PredictorParams {
    algorithm: PredictorAlgorithm,
    colors: Colors,
    bits_per_component: BitsPerComponent,
    columns: Columns,
    row_bytes: RowBytes,
}

impl PredictorParams {
    /// 各構成要素から [`PredictorParams`] を構築する。
    ///
    /// `Colors * Columns` のオーバーフロー時はエラー。
    pub fn from_parts(
        algorithm: PredictorAlgorithm,
        colors: Colors,
        bits_per_component: BitsPerComponent,
        columns: Columns,
        position: ByteOffset,
    ) -> Result<Self, FlateError> {
        let row_bytes = RowBytes::compute(colors, columns, position)?;
        Ok(Self {
            algorithm,
            colors,
            bits_per_component,
            columns,
            row_bytes,
        })
    }

    /// 数値パラメータ（Option）からバリデーションを行い構築する。
    pub fn new(
        predictor: i64,
        colors: Option<i64>,
        bits_per_component: Option<i64>,
        columns: Option<i64>,
        position: ByteOffset,
    ) -> Result<Self, FlateError> {
        let algorithm = PredictorAlgorithm::from_i64_at(predictor, position)?;

        let colors = match colors {
            Some(c) if c >= 1 => {
                let usize_c = usize::try_from(c)
                    .map_err(|_| FlateError::predictor_parameter_overflow_at(position))?;
                let nz = NonZeroUsize::new(usize_c)
                    .ok_or_else(|| FlateError::invalid_predictor_colors_at(position, c))?;
                Colors::new(nz)
            }
            Some(c) => return Err(FlateError::invalid_predictor_colors_at(position, c)),
            None => Colors::one(),
        };

        let bits_per_component = match bits_per_component {
            Some(b) => BitsPerComponent::from_i64_at(b, position)?,
            None => BitsPerComponent::Eight,
        };

        let columns = match columns {
            Some(c) if c >= 1 => {
                let usize_c = usize::try_from(c)
                    .map_err(|_| FlateError::predictor_parameter_overflow_at(position))?;
                let nz = NonZeroUsize::new(usize_c)
                    .ok_or_else(|| FlateError::invalid_predictor_columns_at(position, c))?;
                Columns::new(nz)
            }
            Some(c) => return Err(FlateError::invalid_predictor_columns_at(position, c)),
            None => Columns::one(),
        };

        Self::from_parts(algorithm, colors, bits_per_component, columns, position)
    }

    /// 予測アルゴリズムを取得する。
    #[inline]
    #[must_use]
    pub const fn algorithm(&self) -> PredictorAlgorithm {
        self.algorithm
    }

    /// 予測アルゴリズムの数値表現（`as_i64`）を取得する。
    #[inline]
    #[must_use]
    pub const fn predictor(&self) -> i64 {
        self.algorithm.as_i64()
    }

    /// カラーコンポーネント数を取得する。
    #[inline]
    #[must_use]
    pub const fn colors(&self) -> Colors {
        self.colors
    }

    /// 1コンポーネントあたりのビット数を取得する。
    #[inline]
    #[must_use]
    pub const fn bits_per_component(&self) -> BitsPerComponent {
        self.bits_per_component
    }

    /// 1行あたりのサンプル数を取得する。
    #[inline]
    #[must_use]
    pub const fn columns(&self) -> Columns {
        self.columns
    }

    /// 1行あたりの生データ長（バイト数）を取得する。
    #[inline]
    #[must_use]
    pub const fn row_bytes(&self) -> RowBytes {
        self.row_bytes
    }

    /// `/DecodeParms` 辞書からパラメータを抽出して構築する。
    ///
    /// 辞書内に `/Predictor` が存在しない場合はデフォルト（1: なし）として扱う。
    pub fn from_dictionary(dict: &PdfDictionary, position: ByteOffset) -> Result<Self, FlateError> {
        let predictor = extract_integer_param(dict, DecodeParmsKey::Predictor, position)?;
        let colors = extract_integer_param(dict, DecodeParmsKey::Colors, position)?;
        let bits_per_component =
            extract_integer_param(dict, DecodeParmsKey::BitsPerComponent, position)?;
        let columns = extract_integer_param(dict, DecodeParmsKey::Columns, position)?;

        let predictor_val = predictor.unwrap_or(1);
        Self::new(predictor_val, colors, bits_per_component, columns, position)
    }
}

impl Default for PredictorParams {
    fn default() -> Self {
        Self {
            algorithm: PredictorAlgorithm::None,
            colors: Colors::one(),
            bits_per_component: BitsPerComponent::Eight,
            columns: Columns::one(),
            row_bytes: RowBytes::new(NonZeroUsize::MIN),
        }
    }
}

fn extract_integer_param(
    dict: &PdfDictionary,
    key: DecodeParmsKey,
    position: ByteOffset,
) -> Result<Option<i64>, FlateError> {
    match dict.get(key.as_bytes()) {
        Some(obj) => match obj.as_integer() {
            Some(val) => Ok(Some(val)),
            None => Err(FlateError::invalid_decode_parms_key_type_at(
                position,
                key.as_str(),
                obj.kind(),
            )),
        },
        None => Ok(None),
    }
}

/// Paeth 予測アルゴリズム（RFC 2083 9.5 / ISO 32000-1 7.4.4.4）。
///
/// 左 (`a`)、直上 (`b`)、左上 (`c`) の3点から基準値 `p = a + b - c` を計算し、
/// 最も近い近傍点の値を返す。距離が同等の場合は a, b, c の優先順。
#[inline]
#[must_use]
pub fn paeth_predictor(a: u8, b: u8, c: u8) -> u8 {
    let a_i = a as i16;
    let b_i = b as i16;
    let c_i = c as i16;
    let p = a_i + b_i - c_i;
    let pa = (p - a_i).abs();
    let pb = (p - b_i).abs();
    let pc = (p - c_i).abs();
    if pa <= pb && pa <= pc {
        a
    } else if pb <= pc {
        b
    } else {
        c
    }
}

/// TIFF Predictor 2（水平差分）の逆適用。
///
/// 行ごとに同行内の左サンプル（`i - colors`）を加算（`wrapping_add`）して元データを復元する。
/// 各行は独立しており、次行の先頭サンプルは直前行を参照しない。
pub fn decode_tiff_predictor(
    data: &[u8],
    params: &PredictorParams,
    position: ByteOffset,
) -> Result<Vec<u8>, FlateError> {
    if data.is_empty() {
        return Ok(Vec::new());
    }

    let row_bytes = params.row_bytes().as_usize();
    let bpp = params.colors().get().get();

    if !data.len().is_multiple_of(row_bytes) {
        return Err(FlateError::predictor_data_length_mismatch_at(
            position,
            row_bytes,
            data.len(),
        ));
    }

    let mut out = data.to_vec();
    let num_rows = data.len() / row_bytes;

    for row_idx in 0..num_rows {
        let row_start = row_idx * row_bytes;
        for i in bpp..row_bytes {
            let prev = out[row_start + i - bpp];
            out[row_start + i] = out[row_start + i].wrapping_add(prev);
        }
    }

    Ok(out)
}

/// PNG 予測子フィルタ（None, Sub, Up, Average, Paeth, Optimum）の逆適用。
///
/// 行ごとに先頭 1 バイトのフィルタタグ（0..=4）に従って左・直上・左上の復号済みバイト
/// から予測値を計算し、加算（`wrapping_add`）して生データを復元する。
pub fn decode_png_predictor(
    data: &[u8],
    params: &PredictorParams,
    position: ByteOffset,
) -> Result<Vec<u8>, FlateError> {
    if data.is_empty() {
        return Ok(Vec::new());
    }

    let row_bytes = params.row_bytes().as_usize();
    let record_size = RecordSize::from_row_bytes(params.row_bytes(), position)?.as_usize();

    if !data.len().is_multiple_of(record_size) {
        return Err(FlateError::predictor_data_length_mismatch_at(
            position,
            record_size,
            data.len(),
        ));
    }

    let num_rows = data.len() / record_size;
    let out_len = num_rows
        .checked_mul(row_bytes)
        .ok_or_else(|| FlateError::predictor_parameter_overflow_at(position))?;
    let mut out = vec![0u8; out_len];
    let bpp = params.colors().get().get();

    for row_idx in 0..num_rows {
        let in_record = &data[row_idx * record_size..(row_idx + 1) * record_size];
        let tag = PngFilterTag::from_u8(in_record[0], RowIndex::new(row_idx), position)?;
        let in_row = &in_record[1..];
        let out_row_start = row_idx * row_bytes;

        for i in 0..row_bytes {
            let left = if i >= bpp {
                out[out_row_start + i - bpp]
            } else {
                0
            };

            let above = if row_idx > 0 {
                let prev_row_start = (row_idx - 1) * row_bytes;
                out[prev_row_start + i]
            } else {
                0
            };

            let upper_left = if row_idx > 0 && i >= bpp {
                let prev_row_start = (row_idx - 1) * row_bytes;
                out[prev_row_start + i - bpp]
            } else {
                0
            };

            let predicted = match tag {
                PngFilterTag::None => 0,
                PngFilterTag::Sub => left,
                PngFilterTag::Up => above,
                PngFilterTag::Average => (((left as u16) + (above as u16)) / 2) as u8,
                PngFilterTag::Paeth => paeth_predictor(left, above, upper_left),
            };

            out[out_row_start + i] = in_row[i].wrapping_add(predicted);
        }
    }

    Ok(out)
}

/// Predictor 復号のエントリーポイント。
///
/// `params.algorithm()` に基づき適切な復号処理にディスパッチする。
/// アルゴリズムが None (1) の場合は入力データをそのままクローンして返す。
pub fn decode_predictor(
    data: &[u8],
    params: &PredictorParams,
    position: ByteOffset,
) -> Result<Vec<u8>, FlateError> {
    match params.algorithm() {
        PredictorAlgorithm::None => Ok(data.to_vec()),
        PredictorAlgorithm::Tiff2 => decode_tiff_predictor(data, params, position),
        PredictorAlgorithm::PngNone
        | PredictorAlgorithm::PngSub
        | PredictorAlgorithm::PngUp
        | PredictorAlgorithm::PngAverage
        | PredictorAlgorithm::PngPaeth
        | PredictorAlgorithm::PngOptimum => decode_png_predictor(data, params, position),
    }
}

#[cfg(test)]
mod tests;
