mod inputs;
mod vectors;

use crate::encrypt::tests::position;
use crate::xref::trailer::parse::ParsedTrailer;
use crate::xref::trailer::Trailer;

// qpdf --static-id で生成したテスト用 PDF のトレイラ。
const TRAILER: &[u8] = b"trailer << /Info 2 0 R /Root 1 0 R /Size 6 /Encrypt 5 0 R
    /ID [<31415926535897932384626433832795> <31415926535897932384626433832795>] >>";

fn parse_trailer(source: &[u8]) -> Trailer {
    ParsedTrailer::parse(source, position())
        .expect("トレイラを解析できる")
        .into_trailer()
}
