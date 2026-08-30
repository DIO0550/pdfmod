//! DEFLATE ブロック列の展開。RFC 1951 §3.2.3 に対応する。

use crate::filter::error::FlateError;
use crate::filter::flate::bit_reader::BitReader;
use crate::filter::flate::huffman::HuffmanTables;
use crate::filter::flate::symbols::END_OF_BLOCK;
use crate::filter::flate::window::{Distance, Length, Window};

/// 非圧縮ブロック。
const BLOCK_TYPE_STORED: u8 = 0;
/// 固定 Huffman ブロック。
const BLOCK_TYPE_FIXED: u8 = 1;
/// 動的 Huffman ブロック。
const BLOCK_TYPE_DYNAMIC: u8 = 2;
/// 予約値（BTYPE=11）。`read_bits(2)` の変換が万一失敗したときのフォールバックにも使う。
const BLOCK_TYPE_RESERVED: u8 = 3;
/// BTYPE のビット幅。
const BLOCK_TYPE_BITS: u32 = 2;

/// DEFLATE ストリームの展開器。
///
/// 入力を読む [`BitReader`] と、出力兼スライディングウィンドウの [`Window`]、
/// ブロックをまたいで使い回す固定符号表を束ねる。ブロック間で持ち越す状態はこの 3 つ
/// だけなので、1 つの型に収めて展開手順をメソッドとして表す。
#[derive(Debug)]
pub struct Inflater<'a> {
    /// 圧縮入力のビット単位カーソル。
    reader: BitReader<'a>,
    /// 展開結果。後方参照はこの中を遡る。
    window: Window,
    /// 固定 Huffman の符号表。不変なので生成は 1 度だけ。
    fixed_tables: HuffmanTables,
}

impl<'a> Inflater<'a> {
    /// 展開器を作る。
    ///
    /// `reader` は DEFLATE 本体の先頭に置く（zlib 形式ならヘッダ 2 バイトを読んだ位置）。
    ///
    /// # Errors
    ///
    /// 固定符号表の構築に失敗した場合。固定符号長表は常に妥当なので実際には起きない。
    pub fn new(reader: BitReader<'a>) -> Result<Self, FlateError> {
        Ok(Self {
            reader,
            window: Window::new(),
            // 固定符号表は RFC 1951 §3.2.6 の定数から作られる不変の表なので、
            // BTYPE=01 のブロックが現れるたびに作り直さない。
            fixed_tables: HuffmanTables::fixed()?,
        })
    }

    /// ブロックを順に展開し、`BFINAL` が立ったブロックまで処理する。
    ///
    /// 展開結果は [`Self::into_parts`] で取り出す。
    ///
    /// # Errors
    ///
    /// 入力が尽きた場合は `UnexpectedEof`、BTYPE が予約値（11）なら `ReservedBlockType`、
    /// 各ブロック種別の展開で検出した破損はそれぞれのエラー種別を返す。
    pub fn inflate(&mut self) -> Result<(), FlateError> {
        loop {
            let is_final = self.reader.read_bit()? == 1;
            let position = self.reader.position();
            // read_bits(2) は 0..=3 しか返さないので変換は失敗しない。panic 不在契約のため
            // unwrap を使わず、到達しないフォールバック値として予約値を置く
            // （万一到達しても ReservedBlockType でエラーになる）。
            let block_type = u8::try_from(self.reader.read_bits(BLOCK_TYPE_BITS)?)
                .unwrap_or(BLOCK_TYPE_RESERVED);
            match block_type {
                BLOCK_TYPE_STORED => self.stored_block()?,
                BLOCK_TYPE_FIXED => {
                    Self::huffman_block(&mut self.reader, &mut self.window, &self.fixed_tables)?;
                }
                BLOCK_TYPE_DYNAMIC => {
                    let tables = HuffmanTables::read_dynamic(&mut self.reader)?;
                    Self::huffman_block(&mut self.reader, &mut self.window, &tables)?;
                }
                _ => return Err(FlateError::reserved_block_type_at(position, block_type)),
            }
            if is_final {
                return Ok(());
            }
        }
    }

    /// 展開結果と、DEFLATE 本体の直後に置かれたリーダを取り出す。
    ///
    /// zlib 形式では本体の後ろに Adler-32 トレーラが続くため、リーダも返す。
    #[must_use]
    pub fn into_parts(self) -> (Vec<u8>, BitReader<'a>) {
        (self.window.into_bytes(), self.reader)
    }

    /// 非圧縮ブロック（BTYPE=00）を展開する。
    ///
    /// バイト境界まで切り上げてから LEN / NLEN（各 2 バイト、リトルエンディアン）を読み、
    /// 補数関係を検証したうえで LEN バイトをそのまま出力へ複製する。
    fn stored_block(&mut self) -> Result<(), FlateError> {
        self.reader.align_to_byte();
        let position = self.reader.position();
        let len = self.reader.read_u16_le()?;
        let nlen = self.reader.read_u16_le()?;
        if nlen != !len {
            return Err(FlateError::stored_length_mismatch_at(position, len, nlen));
        }
        let data = self.reader.take_bytes(usize::from(len))?;
        self.window.extend_from_slice(data);
        Ok(())
    }

    /// Huffman 符号で圧縮されたブロックを、ブロック終端シンボルまで展開する。
    ///
    /// 固定符号表と動的符号表で手順は変わらないので、符号表だけを引数で受ける。
    ///
    /// `&mut self` ではなくフィールドを個別に受けるのは、固定ブロックの展開で
    /// `self.fixed_tables` を借りたまま `self.reader` / `self.window` を可変で使うため。
    /// `&mut self` だと構造体全体の排他借用になり、符号表を毎回複製する羽目になる。
    fn huffman_block(
        reader: &mut BitReader<'a>,
        window: &mut Window,
        tables: &HuffmanTables,
    ) -> Result<(), FlateError> {
        loop {
            let symbol = tables.literal.decode(reader)?;
            match symbol {
                0..=255 => window.push_literal(u8::try_from(symbol).unwrap_or_default()),
                END_OF_BLOCK => return Ok(()),
                _ => {
                    let length = Length::read(reader, symbol)?;
                    let distance_symbol = tables.distance.decode(reader)?;
                    let distance = Distance::read(reader, distance_symbol)?;
                    window.copy_match(distance, length, reader.position())?;
                }
            }
        }
    }
}
