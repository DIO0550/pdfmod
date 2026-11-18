mod invalid;
mod vectors;

use super::{Aes256FileKey, Aes256FileKeyError, PasswordRole};
use crate::encrypt::key::EncryptKey;
use crate::encrypt::tests::encrypt;

// qpdf 12.2.0 の --force-R5 --cleartext-metadata --print=none で生成した辞書。
const R5: &str = "<< /Filter /Standard /V 5 /R 5 /Length 256 /P -2056 /EncryptMetadata false
    /CF << /StdCF << /AuthEvent /DocOpen /CFM /AESV3 /Length 32 >> >> /StmF /StdCF /StrF /StdCF
    /U <3916d3759dc2e10a5713cbd17c7f9c877e32aae8341dc9f7784bac7dfcc444ba926cf53fe6a56fc5241068d1711700af>
    /O <db08eb04752944359416b3fae79e6bda6f0fc1674a1816cde5112ecd2d6e5b260a29246108d326fecf659d0b1a349b71>
    /UE <1bb756cf4e964ac65b7c1430f5c04b4ceffdc61106b03427414234a0b25c949a>
    /OE <185bf096b62bbeca3b023d7d7b79aed578b5492687359f76bd668da0707ff883>
    /Perms <73af477cf207fda06ad72737763c4729> >>";
const R5_KEY: &[u8; 32] = b"\x45\x7a\x1b\x5a\x5f\xc0\x4e\x9c\xbf\x99\xf6\x6b\x6a\xe3\xab\x7e\x14\x84\x7f\x09\x0f\x7e\x63\x34\xd6\x49\x6a\x97\xd0\x35\x9c\xc7";

fn derive(
    source: &str,
    role: PasswordRole,
    password: &str,
) -> Result<Aes256FileKey, Aes256FileKeyError> {
    encrypt(source.as_bytes())
        .as_standard()
        .unwrap()
        .derive_aes256_file_key(role, password)
}

fn replace_hex_entry(source: &str, key: EncryptKey, replacement: &str) -> String {
    let marker = format!("/{} <", key.as_str());
    let (before, entry) = source.split_once(&marker).unwrap();
    let (_, after) = entry.split_once('>').unwrap();
    format!("{before}{marker}{replacement}>{after}")
}
