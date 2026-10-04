//! PDFDocEncoding の Unicode 対応表（ISO 32000-1 Annex D.3 Table D.2）。

use super::{
    error::{TextDecodeError, TextDecodeErrorKind},
    DecodePolicy,
};

// Notes=U の制御値も未割当。TAB / LF / CR の Notes=SR は未割当ではない。
const CODE_POINTS: [Option<char>; 256] = [
    None,
    None,
    None,
    None,
    None,
    None,
    None,
    None, // 00–07
    None,
    Some('\u{0009}'),
    Some('\u{000A}'),
    None,
    None,
    Some('\u{000D}'),
    None,
    None, // 08–0F
    None,
    None,
    None,
    None,
    None,
    None,
    None,
    None, // 10–17
    Some('\u{02D8}'),
    Some('\u{02C7}'),
    Some('\u{02C6}'),
    Some('\u{02D9}'),
    Some('\u{02DD}'),
    Some('\u{02DB}'),
    Some('\u{02DA}'),
    Some('\u{02DC}'), // 18–1F
    Some('\u{0020}'),
    Some('\u{0021}'),
    Some('\u{0022}'),
    Some('\u{0023}'),
    Some('\u{0024}'),
    Some('\u{0025}'),
    Some('\u{0026}'),
    Some('\u{0027}'), // 20–27
    Some('\u{0028}'),
    Some('\u{0029}'),
    Some('\u{002A}'),
    Some('\u{002B}'),
    Some('\u{002C}'),
    Some('\u{002D}'),
    Some('\u{002E}'),
    Some('\u{002F}'), // 28–2F
    Some('\u{0030}'),
    Some('\u{0031}'),
    Some('\u{0032}'),
    Some('\u{0033}'),
    Some('\u{0034}'),
    Some('\u{0035}'),
    Some('\u{0036}'),
    Some('\u{0037}'), // 30–37
    Some('\u{0038}'),
    Some('\u{0039}'),
    Some('\u{003A}'),
    Some('\u{003B}'),
    Some('\u{003C}'),
    Some('\u{003D}'),
    Some('\u{003E}'),
    Some('\u{003F}'), // 38–3F
    Some('\u{0040}'),
    Some('\u{0041}'),
    Some('\u{0042}'),
    Some('\u{0043}'),
    Some('\u{0044}'),
    Some('\u{0045}'),
    Some('\u{0046}'),
    Some('\u{0047}'), // 40–47
    Some('\u{0048}'),
    Some('\u{0049}'),
    Some('\u{004A}'),
    Some('\u{004B}'),
    Some('\u{004C}'),
    Some('\u{004D}'),
    Some('\u{004E}'),
    Some('\u{004F}'), // 48–4F
    Some('\u{0050}'),
    Some('\u{0051}'),
    Some('\u{0052}'),
    Some('\u{0053}'),
    Some('\u{0054}'),
    Some('\u{0055}'),
    Some('\u{0056}'),
    Some('\u{0057}'), // 50–57
    Some('\u{0058}'),
    Some('\u{0059}'),
    Some('\u{005A}'),
    Some('\u{005B}'),
    Some('\u{005C}'),
    Some('\u{005D}'),
    Some('\u{005E}'),
    Some('\u{005F}'), // 58–5F
    Some('\u{0060}'),
    Some('\u{0061}'),
    Some('\u{0062}'),
    Some('\u{0063}'),
    Some('\u{0064}'),
    Some('\u{0065}'),
    Some('\u{0066}'),
    Some('\u{0067}'), // 60–67
    Some('\u{0068}'),
    Some('\u{0069}'),
    Some('\u{006A}'),
    Some('\u{006B}'),
    Some('\u{006C}'),
    Some('\u{006D}'),
    Some('\u{006E}'),
    Some('\u{006F}'), // 68–6F
    Some('\u{0070}'),
    Some('\u{0071}'),
    Some('\u{0072}'),
    Some('\u{0073}'),
    Some('\u{0074}'),
    Some('\u{0075}'),
    Some('\u{0076}'),
    Some('\u{0077}'), // 70–77
    Some('\u{0078}'),
    Some('\u{0079}'),
    Some('\u{007A}'),
    Some('\u{007B}'),
    Some('\u{007C}'),
    Some('\u{007D}'),
    Some('\u{007E}'),
    None, // 78–7F
    Some('\u{2022}'),
    Some('\u{2020}'),
    Some('\u{2021}'),
    Some('\u{2026}'),
    Some('\u{2014}'),
    Some('\u{2013}'),
    Some('\u{0192}'),
    Some('\u{2044}'), // 80–87
    Some('\u{2039}'),
    Some('\u{203A}'),
    Some('\u{2212}'),
    Some('\u{2030}'),
    Some('\u{201E}'),
    Some('\u{201C}'),
    Some('\u{201D}'),
    Some('\u{2018}'), // 88–8F
    Some('\u{2019}'),
    Some('\u{201A}'),
    Some('\u{2122}'),
    Some('\u{FB01}'),
    Some('\u{FB02}'),
    Some('\u{0141}'),
    Some('\u{0152}'),
    Some('\u{0160}'), // 90–97
    Some('\u{0178}'),
    Some('\u{017D}'),
    Some('\u{0131}'),
    Some('\u{0142}'),
    Some('\u{0153}'),
    Some('\u{0161}'),
    Some('\u{017E}'),
    None, // 98–9F
    Some('\u{20AC}'),
    Some('\u{00A1}'),
    Some('\u{00A2}'),
    Some('\u{00A3}'),
    Some('\u{00A4}'),
    Some('\u{00A5}'),
    Some('\u{00A6}'),
    Some('\u{00A7}'), // A0–A7
    Some('\u{00A8}'),
    Some('\u{00A9}'),
    Some('\u{00AA}'),
    Some('\u{00AB}'),
    Some('\u{00AC}'),
    None,
    Some('\u{00AE}'),
    Some('\u{00AF}'), // A8–AF
    Some('\u{00B0}'),
    Some('\u{00B1}'),
    Some('\u{00B2}'),
    Some('\u{00B3}'),
    Some('\u{00B4}'),
    Some('\u{00B5}'),
    Some('\u{00B6}'),
    Some('\u{00B7}'), // B0–B7
    Some('\u{00B8}'),
    Some('\u{00B9}'),
    Some('\u{00BA}'),
    Some('\u{00BB}'),
    Some('\u{00BC}'),
    Some('\u{00BD}'),
    Some('\u{00BE}'),
    Some('\u{00BF}'), // B8–BF
    Some('\u{00C0}'),
    Some('\u{00C1}'),
    Some('\u{00C2}'),
    Some('\u{00C3}'),
    Some('\u{00C4}'),
    Some('\u{00C5}'),
    Some('\u{00C6}'),
    Some('\u{00C7}'), // C0–C7
    Some('\u{00C8}'),
    Some('\u{00C9}'),
    Some('\u{00CA}'),
    Some('\u{00CB}'),
    Some('\u{00CC}'),
    Some('\u{00CD}'),
    Some('\u{00CE}'),
    Some('\u{00CF}'), // C8–CF
    Some('\u{00D0}'),
    Some('\u{00D1}'),
    Some('\u{00D2}'),
    Some('\u{00D3}'),
    Some('\u{00D4}'),
    Some('\u{00D5}'),
    Some('\u{00D6}'),
    Some('\u{00D7}'), // D0–D7
    Some('\u{00D8}'),
    Some('\u{00D9}'),
    Some('\u{00DA}'),
    Some('\u{00DB}'),
    Some('\u{00DC}'),
    Some('\u{00DD}'),
    Some('\u{00DE}'),
    Some('\u{00DF}'), // D8–DF
    Some('\u{00E0}'),
    Some('\u{00E1}'),
    Some('\u{00E2}'),
    Some('\u{00E3}'),
    Some('\u{00E4}'),
    Some('\u{00E5}'),
    Some('\u{00E6}'),
    Some('\u{00E7}'), // E0–E7
    Some('\u{00E8}'),
    Some('\u{00E9}'),
    Some('\u{00EA}'),
    Some('\u{00EB}'),
    Some('\u{00EC}'),
    Some('\u{00ED}'),
    Some('\u{00EE}'),
    Some('\u{00EF}'), // E8–EF
    Some('\u{00F0}'),
    Some('\u{00F1}'),
    Some('\u{00F2}'),
    Some('\u{00F3}'),
    Some('\u{00F4}'),
    Some('\u{00F5}'),
    Some('\u{00F6}'),
    Some('\u{00F7}'), // F0–F7
    Some('\u{00F8}'),
    Some('\u{00F9}'),
    Some('\u{00FA}'),
    Some('\u{00FB}'),
    Some('\u{00FC}'),
    Some('\u{00FD}'),
    Some('\u{00FE}'),
    Some('\u{00FF}'), // F8–FF
];

pub(super) struct PdfDocEncoding;

impl PdfDocEncoding {
    pub(super) fn decode(bytes: &[u8], policy: DecodePolicy) -> Result<String, TextDecodeError> {
        let mut text = String::with_capacity(bytes.len());
        for (offset, byte) in bytes.iter().copied().enumerate() {
            let ch = match CODE_POINTS.get(usize::from(byte)).copied().flatten() {
                Some(ch) => ch,
                None => {
                    policy.recover(TextDecodeErrorKind::UndefinedPdfDocByte { byte }, offset)?
                }
            };
            text.push(ch);
        }
        Ok(text)
    }
}
