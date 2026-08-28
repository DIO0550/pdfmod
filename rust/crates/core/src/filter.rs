//! PDF ストリームフィルタ（`/Filter`）による復号を扱うモジュール。
//!
//! ISO 32000-1:2008 §7.4（`docs/specs/07_compression_filters.md`）に対応する。
//! 本ファイルはサブモジュールの mod 宣言のみを持つファサード。
//! `/FlateDecode` の展開（`flate`）とフィルタ復号専用のエラー型（`error`）を提供する。
//! LZW / RunLength / ASCIIHex / ASCII85 の各フィルタ、`/DecodeParms` の Predictor 適用、
//! `/Filter` を見てフィルタを選ぶディスパッチは後続の Issue で追加する。

pub mod error;
pub mod flate;
