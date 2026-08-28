use super::*;

// RFC 1951 §3.2.2 の例（符号長 3,3,3,3,3,2,4,4）から
// 「符号長ごとの個数」と「符号長順のシンボル列」が組み立てられることを確認する。
#[test]
fn rfc_example_lengths_build_canonical_table() {
    // A..H を 0..7 に対応させる。F だけが 2 ビット、G / H が 4 ビット
    let lengths = [3, 3, 3, 3, 3, 2, 4, 4];

    let table = HuffmanTable::from_lengths(&lengths, ByteOffset::new(0))
        .expect("rfc example lengths should build");

    assert_eq!(table.counts.get(2).copied(), Some(1), "one 2-bit code");
    assert_eq!(table.counts.get(3).copied(), Some(5), "five 3-bit codes");
    assert_eq!(table.counts.get(4).copied(), Some(2), "two 4-bit codes");
    // 符号長の昇順、同じ長さならシンボル番号の昇順
    assert_eq!(table.symbols, vec![5, 0, 1, 2, 3, 4, 6, 7]);
}

// 符号長 0 のシンボルが表に載らないことを確認する。
#[test]
fn zero_length_symbols_are_excluded_from_table() {
    // シンボル 1 と 3 は使われない
    let lengths = [1, 0, 1, 0];

    let table = HuffmanTable::from_lengths(&lengths, ByteOffset::new(0))
        .expect("under-subscribed lengths should build");

    assert_eq!(table.symbols, vec![0, 2]);
    assert_eq!(
        table.counts.first().copied(),
        Some(0),
        "counts[0] is always 0"
    );
}

// 符号長が 1 種類だけの最小の符号木を作れることを確認する。
#[test]
fn single_bit_codes_build_minimal_table() {
    let table = HuffmanTable::from_lengths(&[1, 1], ByteOffset::new(0))
        .expect("two 1-bit codes form a complete tree");

    assert_eq!(table.counts.get(1).copied(), Some(2));
    assert_eq!(table.symbols, vec![0, 1]);
}
