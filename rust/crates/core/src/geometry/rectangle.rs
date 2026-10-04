//! 対角の指定順に依存しない矩形。

use crate::object::{ObjectKind, PdfArray, PdfObject};

/// 矩形への変換に失敗した理由。
#[derive(Debug, PartialEq)]
pub enum RectangleError {
    /// 配列が正確に4要素でない。
    InvalidLength {
        /// 実際の要素数。
        actual: usize,
    },
    /// 要素が直接の整数・実数でない。参照は呼び出し側で解決する。
    InvalidElement {
        /// 0始まりの要素位置。
        index: usize,
        /// 要素のオブジェクト種別。
        actual: ObjectKind,
    },
    /// 座標が NaN または無限大。
    NonFiniteCoordinate {
        /// 0始まりの要素位置。
        index: usize,
    },
    /// 座標は有限だが、幅または高さが f64 の有限範囲を超える。
    NonFiniteExtent,
}

/// 各軸が min ≤ max、座標・幅・高さが有限で、幅・高さが非負の矩形。
/// 面積0を許容する。座標は f64 で保持し、大きな整数は f64 の精度で丸める。
#[derive(Debug, PartialEq)]
pub struct Rectangle {
    min_x: f64,
    min_y: f64,
    max_x: f64,
    max_y: f64,
}

impl TryFrom<&PdfArray> for Rectangle {
    type Error = RectangleError;

    /// 4つの直接数値を検証・正規化する。要素数・型・有限性の不正はエラー。
    fn try_from(array: &PdfArray) -> Result<Self, Self::Error> {
        let [x1, y1, x2, y2] = array.as_slice() else {
            return Err(RectangleError::InvalidLength {
                actual: array.len(),
            });
        };
        let x1 = Self::coordinate(x1, 0)?;
        let y1 = Self::coordinate(y1, 1)?;
        let x2 = Self::coordinate(x2, 2)?;
        let y2 = Self::coordinate(y2, 3)?;
        let rectangle = Self {
            min_x: x1.min(x2),
            min_y: y1.min(y2),
            max_x: x1.max(x2),
            max_y: y1.max(y2),
        };
        if !rectangle.width().is_finite() || !rectangle.height().is_finite() {
            return Err(RectangleError::NonFiniteExtent);
        }
        Ok(rectangle)
    }
}

impl Rectangle {
    fn coordinate(object: &PdfObject, index: usize) -> Result<f64, RectangleError> {
        let value = match object {
            // i64 全域は f64 の有限範囲内。整数の精度は f64 に合わせて丸める。
            PdfObject::Integer(value) => value.value() as f64,
            PdfObject::Real(value) => value.value(),
            PdfObject::Null
            | PdfObject::Boolean(_)
            | PdfObject::String(_)
            | PdfObject::Name(_)
            | PdfObject::Array(_)
            | PdfObject::Dictionary(_)
            | PdfObject::Stream(_)
            | PdfObject::Reference(_) => {
                return Err(RectangleError::InvalidElement {
                    index,
                    actual: object.kind(),
                });
            }
        };
        if !value.is_finite() {
            return Err(RectangleError::NonFiniteCoordinate { index });
        }
        Ok(value)
    }

    /// 正規化した左下X座標。
    pub fn min_x(&self) -> f64 {
        self.min_x
    }
    /// 正規化した左下Y座標。
    pub fn min_y(&self) -> f64 {
        self.min_y
    }
    /// 正規化した右上X座標。
    pub fn max_x(&self) -> f64 {
        self.max_x
    }
    /// 正規化した右上Y座標。
    pub fn max_y(&self) -> f64 {
        self.max_y
    }
    /// 有限かつ非負の幅。
    pub fn width(&self) -> f64 {
        (self.max_x - self.min_x).max(0.0)
    }
    /// 有限かつ非負の高さ。
    pub fn height(&self) -> f64 {
        (self.max_y - self.min_y).max(0.0)
    }

    /// 共通部分を返す。離れていれば None、辺・点で接する場合は面積0の矩形。
    pub fn intersection(&self, other: &Self) -> Option<Self> {
        let min_x = self.min_x.max(other.min_x);
        let min_y = self.min_y.max(other.min_y);
        let max_x = self.max_x.min(other.max_x);
        let max_y = self.max_y.min(other.max_y);
        if min_x > max_x || min_y > max_y {
            return None;
        }
        Some(Self {
            min_x,
            min_y,
            max_x,
            max_y,
        })
    }
}

#[cfg(test)]
mod tests;
