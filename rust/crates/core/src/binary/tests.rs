use super::*;

#[test]
fn read_be_uint_various_widths() {
    let data = [
        0x12, // 1B: 0x12 = 18
        0x01, 0x02, // 2B: 0x0102 = 258
        0x01, 0x02, 0x03, // 3B: 0x010203 = 66051
        0x00, 0x00, 0x04, 0x00, // 4B: 0x00000400 = 1024
        0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, // 8B: 0x0123456789abcdef
    ];
    let mut reader = ByteReader::new(&data);

    assert_eq!(reader.read_be_uint(1), Some(0x12));
    assert_eq!(reader.position(), ByteOffset::new(1));

    assert_eq!(reader.read_be_uint(2), Some(0x0102));
    assert_eq!(reader.position(), ByteOffset::new(3));

    assert_eq!(reader.read_be_uint(3), Some(0x010203));
    assert_eq!(reader.position(), ByteOffset::new(6));

    assert_eq!(reader.read_be_uint(4), Some(0x0000_0400));
    assert_eq!(reader.position(), ByteOffset::new(10));

    assert_eq!(reader.read_be_uint(8), Some(0x0123_4567_89ab_cdef));
    assert_eq!(reader.position(), ByteOffset::new(18));
    assert!(reader.is_empty());
}

#[test]
fn read_bytes_advances_cursor() {
    let data = [1, 2, 3, 4, 5];
    let mut reader = ByteReader::new(&data);

    assert_eq!(reader.remaining(), 5);
    assert_eq!(reader.read_bytes(2), Some(&[1, 2][..]));
    assert_eq!(reader.remaining(), 3);
    assert_eq!(reader.position(), ByteOffset::new(2));

    assert_eq!(reader.read_bytes(3), Some(&[3, 4, 5][..]));
    assert_eq!(reader.remaining(), 0);
    assert!(reader.is_empty());
    assert_eq!(reader.position(), ByteOffset::new(5));
}

#[test]
fn read_be_uint_zero_width() {
    let data = [1, 2, 3];
    let mut reader = ByteReader::new(&data);

    assert_eq!(reader.read_be_uint(0), Some(0));
    assert_eq!(reader.position(), ByteOffset::new(0));
    assert_eq!(reader.remaining(), 3);
    assert!(!reader.is_empty());
}

#[test]
fn read_exact_remaining() {
    let data = [10, 20, 30];
    let mut reader = ByteReader::new(&data);

    assert_eq!(reader.read_bytes(3), Some(&[10, 20, 30][..]));
    assert_eq!(reader.remaining(), 0);
    assert!(reader.is_empty());
}

#[test]
fn read_beyond_remaining() {
    let data = [1, 2];
    let mut reader = ByteReader::new(&data);

    assert_eq!(reader.read_bytes(3), None);
    assert_eq!(reader.position(), ByteOffset::new(0));
    assert_eq!(reader.remaining(), 2);

    assert_eq!(reader.read_be_uint(3), None);
    assert_eq!(reader.position(), ByteOffset::new(0));
}
