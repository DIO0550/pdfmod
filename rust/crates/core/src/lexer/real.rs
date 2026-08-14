//! PDF 実数リテラル (ISO 32000-1 §7.3.3) の字句解析。

use super::byte_kind::ByteKind;
use super::Lexer;

impl<'a> Lexer<'a> {
    /// ISO 32000-1 §7.3.3 に従う PDF 実数リテラルを読み取る。
    ///
    /// 受理する字句（いずれも `.` を必ず 1 つだけ含む）:
    /// - 整数部 + `.` + 小数部（例: `34.5`、`123.456`）
    /// - 整数部 + `.` のみ（例: `4.`、`0.`）
    /// - `.` + 小数部のみ（例: `.002`、`.5`）
    /// - 上記いずれにも先頭の `+` / `-` 符号を任意で付与可
    /// - 末尾の whitespace / delimiter / EOF で字句が完結する
    ///
    /// 拒否する字句（`None` 返却 + `pos` を呼び出し前位置に完全巻き戻し）:
    /// - 空入力 / EOF
    /// - 先頭が whitespace / delimiter / 非数字 regular
    /// - 符号 `+` / `-` の単独（直後が数字でも `.` でもない）
    /// - 小数点 `.` の単独（整数部・小数部のいずれにも数字が無い）
    /// - `.` を含まない字句（整数のみ入力）— `.` 必須の実数のみ担当し、整数は `read_integer` の責務として拒否
    /// - 小数点の複数出現（`1.2.3`、`..`、`1..2`）
    /// - 指数表記 `e` / `E`（`1.2e3` / `1.2E3` / `1e2` / `.5e3` / `1.e3`）— ISO 32000-1 仕様外として厳格拒否
    /// - 数字読み中に whitespace / delimiter でも数字でも `.` でもない regular byte（`1.2abc` 等）
    /// - 累積で `f64::INFINITY` 等の非有限値に飽和した場合
    ///
    /// 戻り値の `Some(f64)` は常に有限値（NaN / Inf を返さない）。任意の入力・任意の `pos` で panic しない。
    pub fn read_real(&mut self) -> Option<f64> {
        let start = self.pos;

        let sign: f64 = match self.peek() {
            Some(b'+') => {
                self.pos = self.pos.checked_add(1)?;
                1.0
            }
            Some(b'-') => {
                self.pos = self.pos.checked_add(1)?;
                -1.0
            }
            Some(b) if b.is_ascii_digit() || b == b'.' => 1.0,
            _ => return None,
        };

        let int_start = self.pos;
        let mut int_part: f64 = 0.0;
        while let Some(b) = self.peek() {
            if !b.is_ascii_digit() {
                break;
            }
            int_part = int_part * 10.0 + (b - b'0') as f64;
            let Some(next) = self.pos.checked_add(1) else {
                self.pos = start;
                return None;
            };
            self.pos = next;
        }
        let int_end = self.pos;

        // '.' を含まない字句は実数リテラルではない（read_integer の責務）
        if self.peek() != Some(b'.') {
            self.pos = start;
            return None;
        }
        let Some(after_dot) = self.pos.checked_add(1) else {
            self.pos = start;
            return None;
        };
        self.pos = after_dot;

        let mut frac_part: f64 = 0.0;
        let mut scale: f64 = 0.1;
        while let Some(b) = self.peek() {
            if !b.is_ascii_digit() {
                break;
            }
            frac_part += (b - b'0') as f64 * scale;
            scale *= 0.1;
            let Some(next) = self.pos.checked_add(1) else {
                self.pos = start;
                return None;
            };
            self.pos = next;
        }

        // '.' を含むが整数部・小数部のいずれにも数字が無い場合は拒否（'.' 単独 / '+.' / '-.'）
        if int_end == int_start && self.pos == after_dot {
            self.pos = start;
            return None;
        }

        // 後続が whitespace / delimiter / EOF 以外なら拒否（'1.2abc' / '1.2.3' / '1.2e3' 等）
        match self.peek() {
            None => {}
            Some(b) if ByteKind::is_token_boundary(b) => {}
            _ => {
                self.pos = start;
                return None;
            }
        }

        let value = sign * (int_part + frac_part);
        // f64 累積が Inf に飽和した場合は仕様準拠の値ではないため拒否
        if !value.is_finite() {
            self.pos = start;
            return None;
        }

        Some(value)
    }
}
