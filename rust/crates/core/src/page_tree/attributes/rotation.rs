//! 90度単位のページ回転。

/// 値は0・90・180・270度のいずれか。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageRotation {
    /// 回転なし。
    Degrees0,
    /// 時計回りに90度。
    Degrees90,
    /// 時計回りに180度。
    Degrees180,
    /// 時計回りに270度。
    Degrees270,
}

impl PageRotation {
    /// 90の倍数を0〜270度へ正規化する。倍数でなければ None。
    pub fn new(degrees: i64) -> Option<Self> {
        match degrees.rem_euclid(360) {
            0 => Some(Self::Degrees0),
            90 => Some(Self::Degrees90),
            180 => Some(Self::Degrees180),
            270 => Some(Self::Degrees270),
            _ => None,
        }
    }

    /// 正規化した角度。
    pub fn degrees(self) -> u16 {
        match self {
            Self::Degrees0 => 0,
            Self::Degrees90 => 90,
            Self::Degrees180 => 180,
            Self::Degrees270 => 270,
        }
    }
}
