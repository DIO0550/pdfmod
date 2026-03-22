import type { PdfParseError } from "../errors/index.js";
import type { Result } from "../result/index.js";
import { ok, err } from "../result/index.js";
import { isPdfTokenBoundary, skipWhitespaceAndComments } from "../lexer/pdf-bytes.js";

// %%EOF = [0x25, 0x25, 0x45, 0x4F, 0x46]
const PERCENT = 0x25;
const E_UPPER = 0x45;
const O_UPPER = 0x4f;
const F_UPPER = 0x46;

// "startxref" = [0x73, 0x74, 0x61, 0x72, 0x74, 0x78, 0x72, 0x65, 0x66]
const STARTXREF_BYTES = [0x73, 0x74, 0x61, 0x72, 0x74, 0x78, 0x72, 0x65, 0x66];
const STARTXREF_LEN = STARTXREF_BYTES.length;

const DIGIT_0 = 0x30;
const DIGIT_9 = 0x39;

const LF = 0x0a;
const CR = 0x0d;

function failStartXRef(message: string): Result<number, PdfParseError> {
  return err({ code: "STARTXREF_NOT_FOUND", message });
}

/** Check if position is inside a PDF comment (% ... EOL) by scanning back to line start */
function isInsideComment(data: Uint8Array, pos: number): boolean {
  for (let i = pos - 1; i >= 0; i--) {
    if (data[i] === LF || data[i] === CR) return false;
    if (data[i] === PERCENT) return true;
  }
  return false;
}

export function scanStartXRef(data: Uint8Array): Result<number, PdfParseError> {
  const len = data.length;
  const tailStart = Math.max(0, len - 1024);

  // Step 1: %%EOF 逆方向検索
  let eofOffset = -1;
  if (len < 5) {
    return failStartXRef("%%EOF not found within last 1024 bytes");
  }

  for (let i = len - 5; i >= tailStart; i--) {
    if (
      data[i] === PERCENT &&
      data[i + 1] === PERCENT &&
      data[i + 2] === E_UPPER &&
      data[i + 3] === O_UPPER &&
      data[i + 4] === F_UPPER
    ) {
      if (isInsideComment(data, i)) continue;
      eofOffset = i;
      break;
    }
  }

  if (eofOffset < 0) {
    return failStartXRef("%%EOF not found within last 1024 bytes");
  }

  // Step 2: startxref 逆方向検索
  let startxrefOffset = -1;
  for (let i = eofOffset - 1; i >= tailStart; i--) {
    if (i + STARTXREF_LEN > len) continue;

    let match = true;
    for (let j = 0; j < STARTXREF_LEN; j++) {
      if (data[i + j] !== STARTXREF_BYTES[j]) {
        match = false;
        break;
      }
    }
    if (!match) continue;

    // Token boundary check: before and after startxref must be whitespace/delimiter or data edge
    if (i > 0 && !isPdfTokenBoundary(data[i - 1])) continue;
    const afterPos = i + STARTXREF_LEN;
    if (afterPos < len && !isPdfTokenBoundary(data[afterPos])) continue;

    if (isInsideComment(data, i)) continue;

    // Found the nearest token-boundary startxref; offset validity is checked in Step 3
    startxrefOffset = i;
    break;
  }

  if (startxrefOffset < 0) {
    return failStartXRef("startxref keyword not found before %%EOF");
  }

  // Step 3: オフセット値パース
  let pos = skipWhitespaceAndComments(data, startxrefOffset + STARTXREF_LEN, eofOffset);

  let value = 0;
  let digitsCount = 0;
  while (pos < eofOffset && data[pos] >= DIGIT_0 && data[pos] <= DIGIT_9) {
    value = value * 10 + (data[pos] - DIGIT_0);
    digitsCount++;
    if (!Number.isSafeInteger(value)) {
      return failStartXRef("invalid startxref offset value");
    }
    pos++;
  }

  if (digitsCount === 0) {
    return failStartXRef("invalid startxref offset value");
  }

  // Verify only whitespace/comments remain between digits and %%EOF
  const trailing = skipWhitespaceAndComments(data, pos, eofOffset);
  if (trailing !== eofOffset) {
    return failStartXRef("invalid startxref offset value");
  }

  if (value >= len) {
    return failStartXRef("invalid startxref offset value");
  }

  return ok(value);
}
