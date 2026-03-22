import { type Token, TokenType } from "../types/index.js";
import {
  isPdfDelimiter,
  isPdfWhitespace,
  skipWhitespaceAndComments as skipWsAndComments,
} from "./pdf-bytes.js";

const isWhitespace = isPdfWhitespace;
const isDelimiter = isPdfDelimiter;

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
  return byte >= 48 && byte <= 57; // '0'-'9'
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
    return this.pos < this.data.length ? this.data[this.pos] : -1;
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
    return this.pos < this.data.length ? this.data[this.pos++] : -1;
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
      if (b === 40) {
        // '('
        depth++;
        result += "(";
      } else if (b === 41) {
        // ')'
        depth--;
        if (depth > 0) {
          result += ")";
        }
      } else if (b === 92) {
        // '\\' — escape
        result += this.readEscapeChar();
      } else {
        result += String.fromCharCode(b);
      }
    }

    return { type: TokenType.LiteralString, value: result, offset };
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
    while (true) {
      const token = this.nextToken();
      tokens.push(token);
      if (token.type === TokenType.EOF) {
        break;
      }
    }
    return tokens;
  }
}
