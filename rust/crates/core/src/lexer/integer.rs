//! PDF 整数リテラル (ISO 32000-1 §7.3.3) の字句解析。

use super::byte_kind::ByteKind;
use super::Lexer;

impl<'a> Lexer<'a> {
    /// 現在位置から PDF 整数トークン（ISO 32000-1 §7.3.3）を読み出す。
    ///
    /// 先頭の `+` / `-` 符号（任意）と ASCII 数字 1 文字以上から成る字句を整数として
    /// 解釈し、`i64` で返す。読み終了の条件は「whitespace / delimiter / EOF に到達」
    /// する地点。`.` または非数字 regular byte（例: `123abc`）に到達した場合は整数として
    /// 完結できないため `None` を返し、`pos` を呼び出し前の位置に巻き戻す。整数として
    /// 完結できる場合は `Some(i64)` を返し `pos` を末尾まで進める。
    ///
    /// 以下の場合は `None` を返し、`pos` は呼び出し前の位置に戻す（巻き戻し）:
    /// - 先頭バイトが `+` / `-` / ASCII 数字 のいずれでもない（pos は元々動かないため
    ///   実質的に不変）
    /// - 先頭 `+` / `-` のみで直後に ASCII 数字 が続かない（例: `+x`, `-`, `-(`）
    /// - 数字読み中に `.` を検出（実数候補。上位で `read_real` を試せるよう pos を戻す）
    /// - 数字読み中に数字でも `.` でもない regular byte を検出（PDF トークン境界違反。
    ///   例: `123abc`）
    /// - `i64` のオーバーフロー（`checked_mul` / `checked_add` / `checked_sub` が None）
    ///
    /// `i64::MIN` の絶対値は `i64::MAX + 1` で正数として表現不可のため、累積は
    /// **符号付き**で行う（正なら `checked_add`、負なら `checked_sub`）。これにより
    /// `-9223372036854775808` を `Some(i64::MIN)` として正しく扱える。
    pub fn read_integer(&mut self) -> Option<i64> {
        let start = self.pos;

        let sign: i64 = match self.peek() {
            Some(b'+') => {
                self.pos = self.pos.checked_add(1)?;
                1
            }
            Some(b'-') => {
                self.pos = self.pos.checked_add(1)?;
                -1
            }
            Some(b) if b.is_ascii_digit() => 1,
            _ => return None,
        };

        match self.peek() {
            Some(b) if b.is_ascii_digit() => {}
            _ => {
                self.pos = start;
                return None;
            }
        }

        let mut acc: i64 = 0;
        // 停止条件が EOF だけでなく「境界 break / 巻き戻し return / オーバーフロー return」と
        // 多岐にわたるため、while let ではなく loop + let-else で表現する。
        #[allow(clippy::while_let_loop)]
        loop {
            let Some(b) = self.peek() else { break };

            if ByteKind::is_token_boundary(b) {
                break;
            }
            if !b.is_ascii_digit() {
                self.pos = start;
                return None;
            }

            let d = (b - b'0') as i64;
            let next_acc = acc.checked_mul(10).and_then(|v| match sign {
                1 => v.checked_add(d),
                _ => v.checked_sub(d),
            });
            let Some(v) = next_acc else {
                self.pos = start;
                return None;
            };
            acc = v;

            let Some(next) = self.pos.checked_add(1) else {
                self.pos = start;
                return None;
            };
            self.pos = next;
        }

        Some(acc)
    }
}
