use super::Rc4;

const SECRET_PLAINTEXT: &[u8; 14] = b"Attack at dawn";
const SECRET_CIPHERTEXT: [u8; 14] = [
    0x45, 0xa0, 0x1f, 0x64, 0x5f, 0xc3, 0x5b, 0x38, 0x35, 0x52, 0x54, 0x4b, 0x9b, 0xf5,
];

#[test]
fn matches_secret_vector_in_both_directions() {
    let mut data = *SECRET_PLAINTEXT;
    Rc4::new(b"Secret").unwrap().apply(&mut data);
    assert_eq!(data, SECRET_CIPHERTEXT);

    Rc4::new(b"Secret").unwrap().apply(&mut data);
    assert_eq!(&data, SECRET_PLAINTEXT);
}

#[test]
fn matches_rfc_6229_with_a_five_byte_key() {
    let mut data = [0; 272];
    Rc4::new(&[1, 2, 3, 4, 5]).unwrap().apply(&mut data);

    // RFC 6229 §2 のオフセット 0 と 256。後者では PRGA の添字が一周している。
    assert_eq!(
        data[..16],
        [
            0xb2, 0x39, 0x63, 0x05, 0xf0, 0x3d, 0xc0, 0x27, 0xcc, 0xc3, 0x52, 0x4a, 0x0a, 0x11,
            0x18, 0xa8,
        ]
    );
    assert_eq!(
        data[256..],
        [
            0x1c, 0xfc, 0xf6, 0x2b, 0x03, 0xed, 0xdb, 0x64, 0x1d, 0x77, 0xdf, 0xcf, 0x7f, 0x8d,
            0x8c, 0x93,
        ]
    );
}

#[test]
fn matches_rfc_6229_with_a_sixteen_byte_key() {
    let key = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    let mut data = [0; 16];
    Rc4::new(&key).unwrap().apply(&mut data);

    // RFC 6229 §2 のオフセット 0。
    assert_eq!(
        data,
        [
            0x9a, 0xc7, 0xcc, 0x9a, 0x60, 0x9d, 0x1e, 0xf7, 0xb2, 0x93, 0x28, 0x99, 0xcd, 0xe4,
            0x1b, 0x97,
        ]
    );
}

#[test]
fn rejects_keys_outside_the_pdf_range() {
    for key in [b"".as_slice(), b"Key", &[0; 4], &[0; 17]] {
        assert!(Rc4::new(key).is_none(), "key length {}", key.len());
    }
}

#[test]
fn continues_keystream_across_chunks_and_empty_input() {
    let mut rc4 = Rc4::new(b"Secret").unwrap();
    let mut data = *SECRET_PLAINTEXT;
    let (first, rest) = data.split_at_mut(6);

    rc4.apply(first);
    rc4.apply(&mut []);
    rc4.apply(rest);

    assert_eq!(data, SECRET_CIPHERTEXT);
}
