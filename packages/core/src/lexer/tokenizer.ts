import { Token, TokenType } from "../types/index.js";

const WHITESPACE = new Set([0, 9, 10, 12, 13, 32]); // NUL, TAB, LF, FF, CR, SPACE
const DELIMITER = new Set([
  40, 41, 60, 62, 91, 93, 123, 125, 47, 37,
]); // ( ) < > [ ] { } / %

function isWhitespace(byte: number): boolean {
  return WHITESPACE.has(byte);
}

function isDelimiter(byte: number): boolean {
  return DELIMITER.has(byte);
}

function isDigit(byte: number): boolean {
  return byte >= 48 && byte <= 57; // '0'-'9'
}

/**
 * PDF Lexer/Tokenizer
 *
 * Converts a byte array (Uint8Array) into a stream of typed tokens
 * following ISO 32000-1:2008 lexical conventions.
 */
export class Tokenizer {
  private data: Uint8Array;
  private pos: number;

  constructor(data: Uint8Array) {
    this.data = data;
    this.pos = 0;
  }

  /** Current position in the byte stream */
  get position(): number {
    return this.pos;
  }

  /** Peek at the current byte without advancing */
  private peek(): number {
    return this.pos < this.data.length ? this.data[this.pos] : -1;
  }

  /** Read the current byte and advance */
  private read(): number {
    return this.pos < this.data.length ? this.data[this.pos++] : -1;
  }

  /** Skip whitespace and comments */
  private skipWhitespaceAndComments(): void {
    while (this.pos < this.data.length) {
      const byte = this.data[this.pos];
      if (isWhitespace(byte)) {
        this.pos++;
      } else if (byte === 37) {
        // '%' — comment, skip to end of line
        this.pos++;
        while (this.pos < this.data.length) {
          const b = this.data[this.pos];
          if (b === 10 || b === 13) break; // LF or CR
          this.pos++;
        }
      } else {
        break;
      }
    }
  }

  /** Read the next token from the stream */
  nextToken(): Token {
    this.skipWhitespaceAndComments();

    if (this.pos >= this.data.length) {
      return { type: TokenType.EOF, value: null, offset: this.pos };
    }

    const offset = this.pos;
    const byte = this.read();

    switch (byte) {
      case 91: // '['
        return { type: TokenType.ArrayBegin, value: "[", offset };
      case 93: // ']'
        return { type: TokenType.ArrayEnd, value: "]", offset };
      case 60: // '<'
        if (this.peek() === 60) {
          this.pos++;
          return { type: TokenType.DictBegin, value: "<<", offset };
        }
        return this.readHexString(offset);
      case 62: // '>'
        if (this.peek() === 62) {
          this.pos++;
          return { type: TokenType.DictEnd, value: ">>", offset };
        }
        return { type: TokenType.Keyword, value: ">", offset };
      case 40: // '('
        return this.readLiteralString(offset);
      case 47: // '/'
        return this.readName(offset);
      default:
        if (isDigit(byte) || byte === 43 || byte === 45 || byte === 46) {
          // digit, '+', '-', '.'
          return this.readNumber(offset, byte);
        }
        return this.readKeyword(offset, byte);
    }
  }

  /** Read a hex string: <hex_digits> */
  private readHexString(offset: number): Token {
    let hex = "";
    while (this.pos < this.data.length) {
      const b = this.data[this.pos];
      if (b === 62) {
        // '>'
        this.pos++;
        break;
      }
      if (!isWhitespace(b)) {
        hex += String.fromCharCode(b);
      }
      this.pos++;
    }
    return { type: TokenType.HexString, value: hex, offset };
  }

  /** Read a literal string: (chars) with balanced parentheses */
  private readLiteralString(offset: number): Token {
    let result = "";
    let depth = 1;

    while (this.pos < this.data.length && depth > 0) {
      const b = this.read();
      if (b === 40) {
        // '('
        depth++;
        result += "(";
      } else if (b === 41) {
        // ')'
        depth--;
        if (depth > 0) result += ")";
      } else if (b === 92) {
        // '\\' — escape
        result += this.readEscapeChar();
      } else {
        result += String.fromCharCode(b);
      }
    }

    return { type: TokenType.LiteralString, value: result, offset };
  }

  /** Handle escape sequences in literal strings */
  private readEscapeChar(): string {
    const b = this.read();
    switch (b) {
      case 110:
        return "\n"; // \n
      case 114:
        return "\r"; // \r
      case 116:
        return "\t"; // \t
      case 98:
        return "\b"; // \b
      case 102:
        return "\f"; // \f
      case 40:
        return "("; // \(
      case 41:
        return ")"; // \)
      case 92:
        return "\\"; // \\
      default:
        if (b >= 48 && b <= 55) {
          // octal
          let octal = String.fromCharCode(b);
          for (let i = 0; i < 2; i++) {
            const next = this.peek();
            if (next >= 48 && next <= 55) {
              octal += String.fromCharCode(this.read());
            } else {
              break;
            }
          }
          return String.fromCharCode(parseInt(octal, 8));
        }
        return b === -1 ? "" : String.fromCharCode(b);
    }
  }

  /** Read a name object: /Name */
  private readName(offset: number): Token {
    let name = "";
    while (this.pos < this.data.length) {
      const b = this.data[this.pos];
      if (isWhitespace(b) || isDelimiter(b)) break;
      if (b === 35 && this.pos + 2 < this.data.length) {
        // '#' hex escape
        const hi = this.data[this.pos + 1];
        const lo = this.data[this.pos + 2];
        const hex = String.fromCharCode(hi) + String.fromCharCode(lo);
        name += String.fromCharCode(parseInt(hex, 16));
        this.pos += 3;
      } else {
        name += String.fromCharCode(b);
        this.pos++;
      }
    }
    return { type: TokenType.Name, value: name, offset };
  }

  /** Read a numeric token (integer or real) */
  private readNumber(offset: number, firstByte: number): Token {
    let str = String.fromCharCode(firstByte);
    let hasDecimal = firstByte === 46; // '.'

    while (this.pos < this.data.length) {
      const b = this.data[this.pos];
      if (isDigit(b)) {
        str += String.fromCharCode(b);
        this.pos++;
      } else if (b === 46 && !hasDecimal) {
        hasDecimal = true;
        str += ".";
        this.pos++;
      } else if (isWhitespace(b) || isDelimiter(b)) {
        break;
      } else {
        // Not a valid number continuation — treat as keyword
        return this.readKeyword(offset, firstByte);
      }
    }

    if (hasDecimal) {
      return { type: TokenType.Real, value: parseFloat(str), offset };
    }
    return { type: TokenType.Integer, value: parseInt(str, 10), offset };
  }

  /** Read a keyword (true, false, null, or other keywords like obj, endobj, etc.) */
  private readKeyword(offset: number, firstByte: number): Token {
    let str = String.fromCharCode(firstByte);

    while (this.pos < this.data.length) {
      const b = this.data[this.pos];
      if (isWhitespace(b) || isDelimiter(b)) break;
      str += String.fromCharCode(b);
      this.pos++;
    }

    if (str === "true") {
      return { type: TokenType.Boolean, value: true, offset };
    }
    if (str === "false") {
      return { type: TokenType.Boolean, value: false, offset };
    }
    if (str === "null") {
      return { type: TokenType.Null, value: null, offset };
    }

    return { type: TokenType.Keyword, value: str, offset };
  }

  /** Tokenize the entire input and return all tokens */
  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (true) {
      const token = this.nextToken();
      tokens.push(token);
      if (token.type === TokenType.EOF) break;
    }
    return tokens;
  }
}
