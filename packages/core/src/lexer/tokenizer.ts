import { ByteOffset } from "../types/byte-offset";
import { type Token, TokenType } from "../types/index";
import {
  isPdfDelimiter,
  isPdfWhitespace,
  skipWhitespaceAndComments as skipWsAndComments,
} from "./pdf-bytes";

const isWhitespace = isPdfWhitespace;
const isDelimiter = isPdfDelimiter;

// --- ASCII code point constants ---
const AsciiDigit0 = 48; // '0'
const AsciiDigit7 = 55; // '7'
const AsciiDigit9 = 57; // '9'
const AsciiLeftBracket = 91; // '['
const AsciiRightBracket = 93; // ']'
const AsciiLessThan = 60; // '<'
const AsciiGreaterThan = 62; // '>'
const AsciiLeftParen = 40; // '('
const AsciiRightParen = 41; // ')'
const AsciiSlash = 47; // '/'
const AsciiPlus = 43; // '+'
const AsciiMinus = 45; // '-'
const AsciiDot = 46; // '.'
const AsciiBackslash = 92; // '\\'
const AsciiHash = 35; // '#'
const AsciiLowerN = 110; // 'n'
const AsciiLowerR = 114; // 'r'
const AsciiLowerT = 116; // 't'
const AsciiLowerB = 98; // 'b'
const AsciiLowerF = 102; // 'f'

// --- Numeric constants ---
const EofByte = -1;
const DecimalRadix = 10;
const OctalRadix = 8;
const HexRadix = 16;
const MaxOctalFollowingDigits = 2;
const HexEscapeWidth = 3;

/**
 * 指定バイトがASCII数字（'0'-'9'）かどうかを判定する。
 *
 * @param byte - 判定対象のバイト値
 * @returns 数字であれば `true`
 *
 * @example
 * ```ts
 * isDigit(48); // true ('0')
 * isDigit(65); // false ('A')
 * ```
 */
function isDigit(byte: number): boolean {
  return byte >= AsciiDigit0 && byte <= AsciiDigit9;
}

/**
 * PDF字句解析器（トークナイザ）。
 * バイト配列（Uint8Array）をISO 32000-1:2008の字句規則に従い、
 * 型付きトークンのストリームに変換する。
 *
 * @example
 * ```ts
 * const data = new TextEncoder().encode("123 /Name");
 * const tokenizer = new Tokenizer(data);
 * const token = tokenizer.nextToken();
 * // token = { type: TokenType.Integer, value: 123, offset: 0 }
 * ```
 */
export class Tokenizer {
  private data: Uint8Array;
  private pos: number;

  /**
   * Tokenizerを初期化する。
   *
   * @param data - トークン化対象のPDFバイト配列
   *
   * @example
   * ```ts
   * const tokenizer = new Tokenizer(new Uint8Array([0x31, 0x32, 0x33]));
   * ```
   */
  constructor(data: Uint8Array) {
    this.data = data;
    this.pos = 0;
  }

  /**
   * バイトストリーム内の現在位置。
   *
   * @returns 現在のバイトオフセット
   *
   * @example
   * ```ts
   * const tokenizer = new Tokenizer(new Uint8Array([0x20, 0x41]));
   * tokenizer.position; // 0
   * ```
   */
  get position(): number {
    return this.pos;
  }

  /**
   * 現在位置のバイトを読み進めずに返す。
   * データ末尾に達している場合は -1 を返す。
   *
   * @returns 現在位置のバイト値、または末尾の場合は -1
   *
   * @example
   * ```ts
   * // 内部メソッド: Tokenizerの各readメソッドから使用
   * ```
   */
  private peek(): number {
    return this.pos < this.data.length ? this.data[this.pos] : EofByte;
  }

  /**
   * 現在位置のバイトを読み取り、位置を1つ進める。
   * データ末尾に達している場合は -1 を返す。
   *
   * @returns 読み取ったバイト値、または末尾の場合は -1
   *
   * @example
   * ```ts
   * // 内部メソッド: Tokenizerの各readメソッドから使用
   * ```
   */
  private read(): number {
    return this.pos < this.data.length ? this.data[this.pos++] : EofByte;
  }

  /**
   * 現在位置からホワイトスペースとコメントをスキップする。
   *
   * @example
   * ```ts
   * // 内部メソッド: nextTokenから呼び出される
   * ```
   */
  private skipWhitespaceAndComments(): void {
    this.pos = skipWsAndComments(this.data, this.pos);
  }

  /**
   * ストリームから次のトークンを読み取る。
   * ホワイトスペースとコメントをスキップした後、バイト値に応じて適切なトークンを返す。
   * ストリーム末尾に達した場合は `TokenType.EOF` トークンを返す。
   *
   * @returns 読み取ったトークン
   *
   * @example
   * ```ts
   * const tokenizer = new Tokenizer(new TextEncoder().encode("true"));
   * const token = tokenizer.nextToken();
   * // token = { type: TokenType.Boolean, value: true, offset: 0 }
   * ```
   */
  nextToken(): Token {
    this.skipWhitespaceAndComments();

    if (this.pos >= this.data.length) {
      return {
        type: TokenType.EOF,
        value: null,
        offset: ByteOffset.of(this.pos),
      };
    }

    const offset = this.pos;
    const brandedOffset = ByteOffset.of(offset);
    const byte = this.read();

    switch (byte) {
      case AsciiLeftBracket:
        return {
          type: TokenType.ArrayBegin,
          value: "[",
          offset: brandedOffset,
        };
      case AsciiRightBracket:
        return { type: TokenType.ArrayEnd, value: "]", offset: brandedOffset };
      case AsciiLessThan:
        if (this.peek() === AsciiLessThan) {
          this.pos++;
          return {
            type: TokenType.DictBegin,
            value: "<<",
            offset: brandedOffset,
          };
        }
        return this.readHexString(offset);
      case AsciiGreaterThan:
        if (this.peek() === AsciiGreaterThan) {
          this.pos++;
          return {
            type: TokenType.DictEnd,
            value: ">>",
            offset: brandedOffset,
          };
        }
        return { type: TokenType.Keyword, value: ">", offset: brandedOffset };
      case AsciiLeftParen:
        return this.readLiteralString(offset);
      case AsciiSlash:
        return this.readName(offset);
      default:
        if (
          isDigit(byte) ||
          byte === AsciiPlus ||
          byte === AsciiMinus ||
          byte === AsciiDot
        ) {
          return this.readNumber(offset, byte);
        }
        return this.readKeyword(offset, byte);
    }
  }

  /**
   * 16進文字列トークンを読み取る: `<hex_digits>`。
   * `>` が出現するまで16進数字を収集する。ホワイトスペースは無視される。
   *
   * @param offset - トークン開始位置のバイトオフセット
   * @returns 16進文字列トークン
   *
   * @example
   * ```ts
   * // 内部メソッド: nextTokenから "<" を検出した際に呼び出される
   * ```
   */
  private readHexString(offset: number): Token {
    let hex = "";
    while (this.pos < this.data.length) {
      const b = this.data[this.pos];
      if (b === AsciiGreaterThan) {
        this.pos++;
        break;
      }
      if (!isWhitespace(b)) {
        hex += String.fromCharCode(b);
      }
      this.pos++;
    }
    return {
      type: TokenType.HexString,
      value: hex,
      offset: ByteOffset.of(offset),
    };
  }

  /**
   * リテラル文字列トークンを読み取る: `(chars)`。
   * 括弧のネストに対応し、エスケープシーケンスを処理する。
   *
   * @param offset - トークン開始位置のバイトオフセット
   * @returns リテラル文字列トークン
   *
   * @example
   * ```ts
   * // 内部メソッド: nextTokenから "(" を検出した際に呼び出される
   * ```
   */
  private readLiteralString(offset: number): Token {
    let result = "";
    let depth = 1;

    while (this.pos < this.data.length && depth > 0) {
      const b = this.read();
      if (b === AsciiLeftParen) {
        depth++;
        result += "(";
      } else if (b === AsciiRightParen) {
        depth--;
        if (depth > 0) {
          result += ")";
        }
      } else if (b === AsciiBackslash) {
        result += this.readEscapeChar();
      } else {
        result += String.fromCharCode(b);
      }
    }

    return {
      type: TokenType.LiteralString,
      value: result,
      offset: ByteOffset.of(offset),
    };
  }

  /**
   * リテラル文字列内のエスケープシーケンスを処理する。
   * `\n`, `\r`, `\t`, `\b`, `\f`, `\(`, `\)`, `\\` および8進エスケープに対応する。
   *
   * @returns エスケープシーケンスに対応する文字
   *
   * @example
   * ```ts
   * // 内部メソッド: readLiteralStringからエスケープ文字検出時に呼び出される
   * ```
   */
  private readEscapeChar(): string {
    const b = this.read();
    switch (b) {
      case AsciiLowerN:
        return "\n";
      case AsciiLowerR:
        return "\r";
      case AsciiLowerT:
        return "\t";
      case AsciiLowerB:
        return "\b";
      case AsciiLowerF:
        return "\f";
      case AsciiLeftParen:
        return "(";
      case AsciiRightParen:
        return ")";
      case AsciiBackslash:
        return "\\";
      default:
        if (b >= AsciiDigit0 && b <= AsciiDigit7) {
          return this.readOctalEscape(b);
        }
        return b === EofByte ? "" : String.fromCharCode(b);
    }
  }

  /**
   * オクタルエスケープシーケンスを読み取る。
   * 最初の桁に続く最大2桁のオクタル数字を消費し、対応する文字を返す。
   *
   * @param firstDigit - 最初のオクタル数字のバイト値
   * @returns オクタルエスケープに対応する文字
   */
  private readOctalEscape(firstDigit: number): string {
    let octal = String.fromCharCode(firstDigit);
    for (let i = 0; i < MaxOctalFollowingDigits; i++) {
      const next = this.peek();
      if (next >= AsciiDigit0 && next <= AsciiDigit7) {
        octal += String.fromCharCode(this.read());
      } else {
        break;
      }
    }
    return String.fromCharCode(parseInt(octal, OctalRadix));
  }

  /**
   * 名前オブジェクトトークンを読み取る: `/Name`。
   * `#` による16進エスケープに対応する。
   *
   * @param offset - トークン開始位置のバイトオフセット
   * @returns 名前トークン
   *
   * @example
   * ```ts
   * // 内部メソッド: nextTokenから "/" を検出した際に呼び出される
   * ```
   */
  private readName(offset: number): Token {
    let name = "";
    while (this.pos < this.data.length) {
      const b = this.data[this.pos];
      if (isWhitespace(b) || isDelimiter(b)) {
        break;
      }
      if (b === AsciiHash && this.pos + HexEscapeWidth - 1 < this.data.length) {
        name += this.readHexEscapeInName();
      } else {
        name += String.fromCharCode(b);
        this.pos++;
      }
    }
    return { type: TokenType.Name, value: name, offset: ByteOffset.of(offset) };
  }

  /**
   * 名前オブジェクト内の16進エスケープ (#xx) を読み取る。
   * `#` の後の2バイトを16進数として解釈する。
   *
   * @returns エスケープされた文字
   */
  private readHexEscapeInName(): string {
    const hi = this.data[this.pos + 1];
    const lo = this.data[this.pos + 2];
    const hex = String.fromCharCode(hi) + String.fromCharCode(lo);
    this.pos += HexEscapeWidth;
    return String.fromCharCode(parseInt(hex, HexRadix));
  }

  /**
   * 数値トークン（整数または実数）を読み取る。
   * 小数点を含む場合は `Real`、含まない場合は `Integer` トークンを返す。
   * 有効な数値の続きでない文字が出現した場合はキーワードとして読み取る。
   *
   * @param offset - トークン開始位置のバイトオフセット
   * @param firstByte - 最初に読み取ったバイト
   * @returns 数値トークンまたはキーワードトークン
   *
   * @example
   * ```ts
   * // 内部メソッド: nextTokenから数字/符号/小数点を検出した際に呼び出される
   * ```
   */
  private readNumber(offset: number, firstByte: number): Token {
    let str = String.fromCharCode(firstByte);
    let hasDecimal = firstByte === AsciiDot;

    while (this.pos < this.data.length) {
      const b = this.data[this.pos];
      if (isDigit(b)) {
        str += String.fromCharCode(b);
        this.pos++;
      } else if (b === AsciiDot && !hasDecimal) {
        hasDecimal = true;
        str += ".";
        this.pos++;
      } else if (isWhitespace(b) || isDelimiter(b)) {
        break;
      } else {
        this.pos = offset + 1;
        return this.readKeyword(offset, firstByte);
      }
    }

    const brandedOff = ByteOffset.of(offset);
    if (hasDecimal) {
      return {
        type: TokenType.Real,
        value: parseFloat(str),
        offset: brandedOff,
      };
    }
    return {
      type: TokenType.Integer,
      value: parseInt(str, DecimalRadix),
      offset: brandedOff,
    };
  }

  /**
   * キーワードトークンを読み取る。
   * `true`, `false`, `null` はそれぞれ対応する型のトークンに変換される。
   * それ以外は `obj`, `endobj` 等の一般キーワードトークンとして返す。
   *
   * @param offset - トークン開始位置のバイトオフセット
   * @param firstByte - 最初に読み取ったバイト
   * @returns キーワード、Boolean、またはNullトークン
   *
   * @example
   * ```ts
   * // 内部メソッド: nextTokenからキーワード文字を検出した際に呼び出される
   * ```
   */
  private readKeyword(offset: number, firstByte: number): Token {
    let str = String.fromCharCode(firstByte);

    while (this.pos < this.data.length) {
      const b = this.data[this.pos];
      if (isWhitespace(b) || isDelimiter(b)) {
        break;
      }
      str += String.fromCharCode(b);
      this.pos++;
    }

    const brandedOff = ByteOffset.of(offset);
    if (str === "true") {
      return { type: TokenType.Boolean, value: true, offset: brandedOff };
    }
    if (str === "false") {
      return { type: TokenType.Boolean, value: false, offset: brandedOff };
    }
    if (str === "null") {
      return { type: TokenType.Null, value: null, offset: brandedOff };
    }

    return { type: TokenType.Keyword, value: str, offset: brandedOff };
  }

  /**
   * 入力全体をトークン化し、全トークンの配列を返す。
   * 末尾の `EOF` トークンを含む。
   *
   * @returns トークン配列（末尾は `TokenType.EOF`）
   *
   * @example
   * ```ts
   * const tokenizer = new Tokenizer(new TextEncoder().encode("1 2"));
   * const tokens = tokenizer.tokenize();
   * // tokens.length === 3 (Integer, Integer, EOF)
   * ```
   */
  tokenize(): Token[] {
    const tokens: Token[] = [];
    let token: Token;
    do {
      token = this.nextToken();
      tokens.push(token);
    } while (token.type !== TokenType.EOF);
    return tokens;
  }
}
