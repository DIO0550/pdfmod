use super::parse_stream;

#[test]
fn parse_stream_object_preserves_nul_bytes_in_data() {
    // data 中に NUL バイト (0x00) を含んでも Length ベースで正しく切り出せることを確認する
    let mut input = Vec::new();
    input.extend_from_slice(b"<< /Length 5 >>\nstream\n");
    input.extend_from_slice(&[b'a', 0x00, b'b', 0x00, b'c']);
    input.extend_from_slice(b"\nendstream");
    let stream = parse_stream(&input);
    assert_eq!(stream.data(), &[b'a', 0x00, b'b', 0x00, b'c']);
}

#[test]
fn parse_stream_object_treats_endstream_bytes_inside_data_as_regular_bytes() {
    // data 中に "endstream" バイト列を含んでも Length で正しく切り分けられ、endstream をトークンとして誤検出しないことを確認する
    let payload = b"endstream ignored";
    let length = payload.len();
    let mut input = Vec::new();
    input.extend_from_slice(format!("<< /Length {length} >>\nstream\n").as_bytes());
    input.extend_from_slice(payload);
    input.extend_from_slice(b"\nendstream");
    let stream = parse_stream(&input);
    assert_eq!(stream.data(), payload);
}

#[test]
fn parse_stream_object_preserves_cr_and_lf_control_bytes_inside_data() {
    // data 中に CR / LF 制御バイトが含まれても Length ベース切り出しで忠実に保持されることを確認する
    let payload: &[u8] = b"line1\r\nline2\nline3\rEND";
    let length = payload.len();
    let mut input = Vec::new();
    input.extend_from_slice(format!("<< /Length {length} >>\nstream\n").as_bytes());
    input.extend_from_slice(payload);
    input.extend_from_slice(b"\nendstream");
    let stream = parse_stream(&input);
    assert_eq!(stream.data(), payload);
}

#[test]
fn parse_stream_object_handles_64kb_data_blob_correctly() {
    // 境界値・大容量: 64 KB 級 (65_536 バイト) の擬似ランダムデータを take_bytes が正しく切り出せることを確認する
    // 擬似ランダムはハッシュ的計算 (i wrapping_mul 91) の下位バイトを使う (Math.random 非依存で決定的)
    let payload: Vec<u8> = (0..65_536u32)
        .map(|i| (i.wrapping_mul(91) & 0xFF) as u8)
        .collect();
    let length = payload.len();
    let mut input = Vec::new();
    input.extend_from_slice(format!("<< /Length {length} >>\nstream\n").as_bytes());
    input.extend_from_slice(&payload);
    input.extend_from_slice(b"\nendstream");
    let stream = parse_stream(&input);
    assert_eq!(stream.data().len(), payload.len());
    assert_eq!(stream.data(), payload.as_slice());
}
