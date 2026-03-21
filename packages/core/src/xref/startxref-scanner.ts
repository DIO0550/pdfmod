import type { PdfParseError } from "../errors/index.js";
import type { Result } from "../result/index.js";
import { ok, err } from "../result/index.js";

// %%EOF = [0x25, 0x25, 0x45, 0x4F, 0x46]
const PERCENT = 0x25;
const E_UPPER = 0x45;
const O_UPPER = 0x4f;
const F_UPPER = 0x46;

// "startxref" = [0x73, 0x74, 0x61, 0x72, 0x74, 0x78, 0x72, 0x65, 0x66]
const STARTXREF_BYTES = [0x73, 0x74, 0x61, 0x72, 0x74, 0x78, 0x72, 0x65, 0x66];

const DIGIT_0 = 0x30;
const DIGIT_9 = 0x39;

const LF = 0x0a;
const CR = 0x0d;

/** PDF仕様のホワイトスペース6種を判定（ISO 32000 Table 1） */
function isPdfWhitespace(byte: number): boolean {
  return (
    byte === 0x00 ||
    byte === 0x09 ||
    byte === 0x0a ||
    byte === 0x0c ||
    byte === 0x0d ||
    byte === 0x20
  );
}

/** PDFホワイトスペースとコメント（% から行末まで）をスキップし、次の非空白位置を返す */
function skipWhitespaceAndComments(data: Uint8Array, pos: number, end?: number): number {
  const limit = end ?? data.length;
  let i = pos;
  while (i < limit) {
    if (isPdfWhitespace(data[i])) {
      i++;
      continue;
    }
    if (data[i] === PERCENT) {
      // Skip comment until end of line
      i++;
      while (i < limit && data[i] !== LF && data[i] !== CR) {
        i++;
      }
      continue;
    }
    break;
  }
  return i;
}

export function scanStartXRef(data: Uint8Array): Result<number, PdfParseError> {
  const len = data.length;
  const tailStart = Math.max(0, len - 1024);

  // Step 1: %%EOF 逆方向検索
  let eofOffset = -1;
  if (len < 5) {
    return err({
      code: "STARTXREF_NOT_FOUND",
      message: "%%EOF not found within last 1024 bytes",
    });
  }

  for (let i = len - 5; i >= tailStart; i--) {
    if (
      data[i] === PERCENT &&
      data[i + 1] === PERCENT &&
      data[i + 2] === E_UPPER &&
      data[i + 3] === O_UPPER &&
      data[i + 4] === F_UPPER
    ) {
      eofOffset = i;
      break;
    }
  }

  if (eofOffset < 0) {
    return err({
      code: "STARTXREF_NOT_FOUND",
      message: "%%EOF not found within last 1024 bytes",
    });
  }

  // Step 2: startxref 逆方向検索
  let startxrefOffset = -1;
  for (let i = eofOffset - 1; i >= tailStart; i--) {
    if (i + 9 > len) continue;

    let match = true;
    for (let j = 0; j < 9; j++) {
      if (data[i + j] !== STARTXREF_BYTES[j]) {
        match = false;
        break;
      }
    }
    if (!match) continue;

    // Token boundary check: before startxref must be whitespace or start of data
    if (i > 0 && !isPdfWhitespace(data[i - 1])) continue;

    // Validate: after "startxref" (9 bytes), skip whitespace/comments, must find digits
    const afterKeyword = skipWhitespaceAndComments(data, i + 9, eofOffset);
    if (afterKeyword < eofOffset && data[afterKeyword] >= DIGIT_0 && data[afterKeyword] <= DIGIT_9) {
      startxrefOffset = i;
      break;
    }
  }

  if (startxrefOffset < 0) {
    return err({
      code: "STARTXREF_NOT_FOUND",
      message: "startxref keyword not found before %%EOF",
    });
  }

  // Step 3: オフセット値パース
  let pos = skipWhitespaceAndComments(data, startxrefOffset + 9, eofOffset);

  let digits = "";
  while (pos < eofOffset && data[pos] >= DIGIT_0 && data[pos] <= DIGIT_9) {
    digits += String.fromCharCode(data[pos]);
    pos++;
  }

  if (digits.length === 0) {
    return err({
      code: "STARTXREF_NOT_FOUND",
      message: "invalid startxref offset value",
    });
  }

  return ok(parseInt(digits, 10));
}
