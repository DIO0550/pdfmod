mod aes256;
mod errors;
mod legacy;
mod roles;

use crate::encrypt::key::EncryptKey;
use crate::encrypt::standard::StandardSecurityHandler;
use crate::encrypt::tests::{encrypt, position};
use crate::xref::trailer::parse::ParsedTrailer;
use crate::xref::trailer::Trailer;

// qpdf --static-id で生成したテスト用 PDF のトレイラ。
const TRAILER: &[u8] = b"trailer << /Info 2 0 R /Root 1 0 R /Size 6 /Encrypt 5 0 R
    /ID [<31415926535897932384626433832795> <31415926535897932384626433832795>] >>";

// qpdf 12.2.0 の --encrypt と --show-encryption-key で確認した辞書と鍵（owner = "owner"）。
const R2: &str = "<< /Filter /Standard /V 1 /R 2 /Length 40 /P -4
    /O <c92422687facee686e373f10b5c7d04738053152f7e2ee30e11c69ec442576ab>
    /U <b3d9fa366906ef42f354c6deb74c59075eaf334eb7c04356ba0d7f3dd8b51d0a> >>";
const R2_KEY: &[u8] = b"\x0e\x7b\x66\x93\x8a";

const R3: &str = "<< /Filter /Standard /V 2 /R 3 /Length 128 /P -4
    /O <4ee1d41e94737be19102bf7b4641e524b372b64683f2beaff9f83a4acd0dbaf9>
    /U <3af1a0bcf5545dc6dae3e61e4dbc40e10122456a91bae5134273a6db134c87c4> >>";
const R3_USER_PASSWORD: &[u8; 32] = b"0123456789abcdefghijklmnopqrstuv";
const R3_KEY: &[u8] = b"\xfc\xe7\xf5\xa9\x51\x37\xc4\x76\xe4\xd0\x1a\x99\x19\xd2\x6e\x6c";

const R4_CLEAR_METADATA: &str = "<< /Filter /Standard /V 4 /R 4 /Length 128
    /CF << /StdCF << /AuthEvent /DocOpen /CFM /AESV2 /Length 16 >> >>
    /StmF /StdCF /StrF /StdCF /P -3392 /EncryptMetadata false
    /O <0ba3835f88f90388e74e54584125ce142be0de24c6b0d37746e075b891756671>
    /U <3250600e32dc6a8eae7dc501b5ba8e520122456a91bae5134273a6db134c87c4> >>";
const R4_CLEAR_METADATA_KEY: &[u8] =
    b"\x2d\x36\x57\xbf\x2e\xed\x39\xf7\x1c\x70\x04\x23\x87\x7a\x4e\x15";

// qpdf 12.2.0 の --force-R5 --cleartext-metadata --print=none で生成した辞書（user = "user-r5", owner = "owner-r5"）。
const R5: &str = "<< /Filter /Standard /V 5 /R 5 /Length 256 /P -2056 /EncryptMetadata false
    /CF << /StdCF << /AuthEvent /DocOpen /CFM /AESV3 /Length 32 >> >> /StmF /StdCF /StrF /StdCF
    /U <3916d3759dc2e10a5713cbd17c7f9c877e32aae8341dc9f7784bac7dfcc444ba926cf53fe6a56fc5241068d1711700af>
    /O <db08eb04752944359416b3fae79e6bda6f0fc1674a1816cde5112ecd2d6e5b260a29246108d326fecf659d0b1a349b71>
    /UE <1bb756cf4e964ac65b7c1430f5c04b4ceffdc61106b03427414234a0b25c949a>
    /OE <185bf096b62bbeca3b023d7d7b79aed578b5492687359f76bd668da0707ff883>
    /Perms <73af477cf207fda06ad72737763c4729> >>";
const R5_KEY: &[u8; 32] = b"\x45\x7a\x1b\x5a\x5f\xc0\x4e\x9c\xbf\x99\xf6\x6b\x6a\xe3\xab\x7e\x14\x84\x7f\x09\x0f\x7e\x63\x34\xd6\x49\x6a\x97\xd0\x35\x9c\xc7";

fn parse_trailer(source: &[u8]) -> Trailer {
    ParsedTrailer::parse(source, position())
        .expect("トレイラを解析できる")
        .into_trailer()
}

fn standard_handler(source: &[u8]) -> StandardSecurityHandler {
    encrypt(source)
        .as_standard()
        .expect("標準セキュリティハンドラを取得できる")
        .clone()
}

fn replace_hex_entry(source: &str, key: EncryptKey, replacement: &str) -> String {
    let marker = format!("/{} <", key.as_str());
    let (before, entry) = source.split_once(&marker).expect("対象キーが見つかる");
    let (_, after) = entry.split_once('>').expect("16進文字列の終端がある");
    format!("{before}{marker}{replacement}>{after}")
}
