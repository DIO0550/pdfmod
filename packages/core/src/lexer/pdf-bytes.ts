/** PDF whitespace bytes (ISO 32000 Table 1): NUL, TAB, LF, FF, CR, SPACE */
const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);

/** PDF delimiter bytes (ISO 32000 Table 2): ( ) < > [ ] { } / % */
const DELIMITER = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

export function isPdfWhitespace(byte: number): boolean {
  return WHITESPACE.has(byte);
}

export function isPdfDelimiter(byte: number): boolean {
  return DELIMITER.has(byte);
}

export function isPdfTokenBoundary(byte: number): boolean {
  return WHITESPACE.has(byte) || DELIMITER.has(byte);
}

export function skipWhitespaceAndComments(data: Uint8Array, pos: number, end?: number): number {
  const limit = end ?? data.length;
  let i = pos;
  while (i < limit) {
    if (isPdfWhitespace(data[i])) {
      i++;
      continue;
    }
    if (data[i] === 0x25) {
      i++;
      while (i < limit && data[i] !== 0x0a && data[i] !== 0x0d) {
        i++;
      }
      continue;
    }
    break;
  }
  return i;
}
