use std::fmt::Write;

use super::{Md5, DIGEST_LEN};

fn hex(digest: [u8; DIGEST_LEN]) -> String {
    let mut output = String::with_capacity(DIGEST_LEN * 2);
    for byte in digest {
        write!(output, "{byte:02x}").unwrap();
    }
    output
}

#[test]
fn matches_all_rfc_1321_vectors() {
    let vectors: &[(&[u8], &str)] = &[
        (b"", "d41d8cd98f00b204e9800998ecf8427e"),
        (b"a", "0cc175b9c0f1b6a831c399e269772661"),
        (b"abc", "900150983cd24fb0d6963f7d28e17f72"),
        (b"message digest", "f96b697d7cb7938d525a2f31aaf161d0"),
        (
            b"abcdefghijklmnopqrstuvwxyz",
            "c3fcd3d76192e4007dfb496cca67e13b",
        ),
        (
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
            "d174ab98d277d9f5a5611c2c9f419d9f",
        ),
        (
            b"12345678901234567890123456789012345678901234567890123456789012345678901234567890",
            "57edf4a22be3c955ac49da2e2107b67a",
        ),
    ];

    for &(input, expected) in vectors {
        assert_eq!(hex(Md5::digest(input)), expected, "{input:?}");
    }
}

#[test]
fn finalizes_at_block_boundaries_for_every_split() {
    // 00, 01, ... の先頭 len バイトを Python の hashlib.md5 で照合した値。
    let vectors = [
        (55, "6912ee65fff2d9f9ce2508cddf8bcda0"),
        (56, "51fdd1acda72405dfdfa03fcb85896d7"),
        (63, "48a6295221902e8e0938f773a7185e72"),
        (64, "b2d3f56bc197fd985d5965079b5e7148"),
        (65, "8bd7053801c768420faf816fadba971c"),
        (119, "1c772251899a7ff007400b888d6b2042"),
        (120, "b7ba1efc6022e9ed272f00b8831e26e6"),
    ];
    let bytes: Vec<_> = (0..=u8::MAX).collect();

    for (len, expected) in vectors {
        for split in 0..=len {
            let mut md5 = Md5::new();
            md5.update(&bytes[..split]);
            md5.update(&bytes[split..len]);
            assert_eq!(
                hex(md5.finalize()),
                expected,
                "{len} bytes, split at {split}"
            );
        }
    }
}

#[test]
fn keeps_partial_blocks_across_many_updates() {
    let input = [0xa5; 513];
    let expected = "b5670ce4c28d66a1252669692935f3b4";

    for chunk_len in [1, 7, 55, 63, 64, 65, 129] {
        let mut md5 = Md5::new();
        for chunk in input.chunks(chunk_len) {
            md5.update(chunk);
            md5.update(b"");
        }
        assert_eq!(hex(md5.finalize()), expected, "chunk length {chunk_len}");
    }
}

#[test]
fn rehashes_a_digest_prefix_fifty_times() {
    for (prefix_len, expected) in [
        (5, "f84aa1ebc58926bf6db85f0634deed3b"),
        (16, "c3c28188e3295593b1fdc347f343d024"),
    ] {
        let mut digest = Md5::digest(b"abc");
        for _ in 0..50 {
            digest = Md5::digest(&digest[..prefix_len]);
        }
        assert_eq!(hex(digest), expected, "{prefix_len}-byte prefix");
    }
}
