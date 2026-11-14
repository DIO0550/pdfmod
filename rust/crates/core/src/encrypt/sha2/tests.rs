use std::fmt::Write;

use super::sha256::Sha256;
use super::sha512::{Sha384, Sha512};

fn hex(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        write!(output, "{byte:02x}").unwrap();
    }
    output
}

#[test]
fn matches_nist_short_and_long_messages() {
    let sha256_long = b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
    let sha512_long = b"abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmno\
                       ijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu";
    assert_eq!(
        hex(&Sha256::digest(b"abc").unwrap()),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    assert_eq!(
        hex(&Sha256::digest(sha256_long).unwrap()),
        "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
    );
    assert_eq!(
        hex(&Sha384::digest(b"abc").unwrap()),
        "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded163\
        1a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7"
    );
    assert_eq!(
        hex(&Sha384::digest(sha512_long).unwrap()),
        "09330c33f71147e83d192fc782cd1b4753111b173b3b05d2\
        2fa08086e3b0f712fcc7c71a557e2db966c3e9fa91746039"
    );
    assert_eq!(
        hex(&Sha512::digest(b"abc").unwrap()),
        "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a\
        2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f"
    );
    assert_eq!(
        hex(&Sha512::digest(sha512_long).unwrap()),
        "8e959b75dae313da8cf4f72814fc143f8f7779c6eb9f7fa17299aeadb6889018\
        501d289e4900f7e4331b99dec4b5433ac7d329eeb6dd26545e96e55b874be909"
    );
}

#[test]
fn matches_empty_message_digests() {
    assert_eq!(
        hex(&Sha256::digest(b"").unwrap()),
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    assert_eq!(
        hex(&Sha384::digest(b"").unwrap()),
        "38b060a751ac96384cd9327eb1b1e36a21fdb71114be0743\
        4c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b"
    );
    assert_eq!(
        hex(&Sha512::digest(b"").unwrap()),
        "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce\
        47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e"
    );
}

#[test]
fn matches_nist_million_a_in_chunks() {
    let chunk = [b'a'; 1000];
    let mut sha256 = Sha256::new();
    let mut sha384 = Sha384::new();
    let mut sha512 = Sha512::new();

    for _ in 0..1000 {
        sha256.update(&chunk).unwrap();
        sha384.update(&chunk).unwrap();
        sha512.update(&chunk).unwrap();
    }

    assert_eq!(
        hex(&sha256.finalize()),
        "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0"
    );
    assert_eq!(
        hex(&sha384.finalize()),
        "9d0e1809716474cb086e834e310a4a1ced149e9c00f24852\
        7972cec5704c2a5b07b8b3dc38ecc4ebae97ddd87f3d8985"
    );
    assert_eq!(
        hex(&sha512.finalize()),
        "e718483d0ce769644e2e42c7bc15b4638e1f98b13b2044285632a803afa973eb\
        de0ff244877ea60a4cb0432ce577c31beb009c5c2c49aa2e4eadb217ad8cc09b"
    );
}

#[test]
fn sha256_matches_padding_boundaries_at_every_split() {
    // 00, 01, ... の先頭 len バイトを Python の hashlib で照合した値。
    let input: [u8; 65] = std::array::from_fn(|index| u8::try_from(index).unwrap());
    let vectors = [
        (
            55,
            "463eb28e72f82e0a96c0a4cc53690c571281131f672aa229e0d45ae59b598b59",
        ),
        (
            56,
            "da2ae4d6b36748f2a318f23e7ab1dfdf45acdc9d049bd80e59de82a60895f562",
        ),
        (
            63,
            "29af2686fd53374a36b0846694cc342177e428d1647515f078784d69cdb9e488",
        ),
        (
            64,
            "fdeab9acf3710362bd2658cdc9a29e8f9c757fcf9811603a8c447cd1d9151108",
        ),
        (
            65,
            "4bfd2c8b6f1eec7a2afeb48b934ee4b2694182027e6d0fc075074f2fabb31781",
        ),
    ];

    for (len, expected) in vectors {
        for split in 0..=len {
            let (prefix, suffix) = input[..len].split_at(split);
            let mut sha = Sha256::new();
            sha.update(prefix).unwrap();
            sha.update(b"").unwrap();
            sha.update(suffix).unwrap();

            assert_eq!(
                hex(&sha.finalize()),
                expected,
                "{len} bytes, split at {split}"
            );
        }
    }
}

#[test]
fn sha384_and_sha512_match_padding_boundaries_at_every_split() {
    // 00, 01, ... の先頭 len バイトを Python の hashlib で照合した値。
    let input: [u8; 129] = std::array::from_fn(|index| u8::try_from(index).unwrap());
    let vectors = [
        (
            111,
            "f5f9fe110d809d34029de262a01b208356caec6e054c7f92\
            6b2591f6c9780579d4b59f5578c6f531a84f158a33660cef",
            "a1a111449b198d9b1f538bad7f3fc1022b3a5b1a5e90a0bc860de8512746cbc3\
            1599e6c834de3a3235327af0b51ff57bf7acf1974a73014d9c3953812edc7c8d",
        ),
        (
            112,
            "33ba080ec0ccb378e4e95fed3b26c23aa1a280476e007519\
            ee47f60cd9c5c8a65d627259a9aa2fd33ca06d3c14ee5548",
            "c5fbd731d19d2ae1180f001be72c2c1aaba1d7b094b3748880e24593b8e117a7\
            50e11c1bd867cc2f96dace8c8b74abd2d5c4f236be444e77d30d1916174070b9",
        ),
        (
            127,
            "d5fcfe2fcf6b3ef375ede37c8123d9b78065fecc1d55197e\
            2f7721e6e9a93d0ba4d7fd15f9b96dea2744df24141ba2ef",
            "eab89674feaa34e27aebeeff3c0a4d70070bb872d5e9f186cf1dbbdee517b6e3\
            5724d629ff025a5b07185e911ada7e3c8acf830aa0e4f71777bd2d44f504f7f0",
        ),
        (
            128,
            "ca2385773319124534111a36d0581fc3f00815e907034b90\
            cff9c3a861e126a741d5dfcff65a417b6d7296863ac0ec17",
            "1dffd5e3adb71d45d2245939665521ae001a317a03720a45732ba1900ca3b835\
            1fc5c9b4ca513eba6f80bc7b1d1fdad4abd13491cb824d61b08d8c0e1561b3f7",
        ),
        (
            129,
            "ef49ae5b9ad51433d00323528d81ea8d2e4d2b507dbd9f1c\
            b84f952b66249a788b1c89fcdb77a0db9f1feb901d47fc73",
            "1d9da57fbbdab09afb3506ab2d223d06109d65c1c8ad197f50138f714bc4c3f2\
            fe5787922639c680acad1c651f955990425954ce2cba0c5cc83f2667d878eb0f",
        ),
    ];

    for (len, expected384, expected512) in vectors {
        for split in 0..=len {
            let (prefix, suffix) = input[..len].split_at(split);
            let mut sha384 = Sha384::new();
            let mut sha512 = Sha512::new();
            sha384.update(prefix).unwrap();
            sha512.update(prefix).unwrap();
            sha384.update(b"").unwrap();
            sha512.update(b"").unwrap();
            sha384.update(suffix).unwrap();
            sha512.update(suffix).unwrap();

            assert_eq!(
                hex(&sha384.finalize()),
                expected384,
                "SHA-384, {len} bytes, split at {split}"
            );
            assert_eq!(
                hex(&sha512.finalize()),
                expected512,
                "SHA-512, {len} bytes, split at {split}"
            );
        }
    }
}

#[test]
fn repeatedly_hashes_fixed_size_digests_across_all_variants() {
    let mut digest = Sha512::digest(b"pdfmod").unwrap();
    for _ in 0..32 {
        let sha256 = Sha256::digest(&digest).unwrap();
        let sha384 = Sha384::digest(&sha256).unwrap();
        digest = Sha512::digest(&sha384).unwrap();
    }

    // 3 種の出力長を使う 96 回の再ハッシュを Python の hashlib で照合した値。
    assert_eq!(
        hex(&digest),
        "a34b2d4717ea2c3755f06d798c8e1483903898c8eca55c4fb2f5c4ce9da2e011\
        3d9832f4365701f7d705d7f3b460c6a3c30a1ee047badc05d961095db11384aa"
    );
}
