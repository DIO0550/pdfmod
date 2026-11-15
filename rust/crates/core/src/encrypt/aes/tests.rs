mod cbc;
mod ecb;
mod pdf_cbc;

const KEY_128: &str = "000102030405060708090a0b0c0d0e0f";
const KEY_256: &str = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

fn hex<const N: usize>(input: &str) -> [u8; N] {
    assert_eq!(input.len(), N * 2);
    std::array::from_fn(|index| u8::from_str_radix(&input[index * 2..index * 2 + 2], 16).unwrap())
}
