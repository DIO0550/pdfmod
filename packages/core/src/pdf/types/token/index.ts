import type { Option } from "../../../utils/option/index";
import { none } from "../../../utils/option/index";
import type { Result } from "../../../utils/result/index";
import { ok } from "../../../utils/result/index";
import type { PdfError } from "../../errors/index";
import type { ByteOffset } from "../byte-offset/index";
import type { PdfValue } from "../pdf-types/index";
import { TokenBoolean } from "./boolean/index";
import { TokenHexString } from "./hex-string/index";
import { TokenInteger } from "./integer/index";
import { TokenLiteralString } from "./literal-string/index";
import { TokenName } from "./name/index";
import { TokenNull } from "./null/index";
import { TokenReal } from "./real/index";

export { TokenBoolean } from "./boolean/index";
export { TokenHexString } from "./hex-string/index";
export { TokenInteger } from "./integer/index";
export { TokenLiteralString } from "./literal-string/index";
export { TokenName } from "./name/index";
export { TokenNull } from "./null/index";
export { TokenReal } from "./real/index";

/**
 * PDFトークンの種別を表す列挙型。
 * PDF字句解析器および ContentStream 解釈器が生成するトークンの分類に使用する。
 */
export enum TokenType {
  Boolean = "Boolean",
  Integer = "Integer",
  Real = "Real",
  LiteralString = "LiteralString",
  HexString = "HexString",
  Name = "Name",
  ArrayBegin = "ArrayBegin",
  ArrayEnd = "ArrayEnd",
  DictBegin = "DictBegin",
  DictEnd = "DictEnd",
  Null = "Null",
  Keyword = "Keyword",
  Operator = "Operator",
  InlineImage = "InlineImage",
  EOF = "EOF",
}

/**
 * 配列開始 (`[`) トークン。
 */
export interface TokenArrayBegin {
  type: TokenType.ArrayBegin;
  value: "[";
  offset: ByteOffset;
}

/**
 * 配列終了 (`]`) トークン。
 */
export interface TokenArrayEnd {
  type: TokenType.ArrayEnd;
  value: "]";
  offset: ByteOffset;
}

/**
 * 辞書開始 (`<<`) トークン。
 */
export interface TokenDictBegin {
  type: TokenType.DictBegin;
  value: "<<";
  offset: ByteOffset;
}

/**
 * 辞書終了 (`>>`) トークン。
 */
export interface TokenDictEnd {
  type: TokenType.DictEnd;
  value: ">>";
  offset: ByteOffset;
}

/**
 * キーワード (`obj`, `endobj`, `stream`, `R` 等) トークン。
 */
export interface TokenKeyword {
  type: TokenType.Keyword;
  value: string;
  offset: ByteOffset;
}

/**
 * EOFトークン。終端を示す非値トークンとして value は `null` 固定。
 */
export interface TokenEOF {
  type: TokenType.EOF;
  value: null;
  offset: ByteOffset;
}

/**
 * ContentStream の演算子 (例: `BT`, `m`, `l`, `S`) を表すトークン。
 * Tokenizer は生成しない。`Operator.of()` から生成される。
 */
export interface Operator {
  type: TokenType.Operator;
  name: string;
  offset: ByteOffset;
}

/**
 * Inline image 辞書内の key/value pair。
 * 同一 key の重複や順序を失わないように配列要素として保持する。
 */
export interface TokenInlineImageDictEntry {
  readonly key: TokenName;
  readonly value: ReadonlyArray<Token>;
}

/**
 * ContentStream 内の inline image (`BI ... ID ... EI`) を表すトークン。
 */
export interface TokenInlineImage {
  type: TokenType.InlineImage;
  readonly dict: ReadonlyArray<TokenInlineImageDictEntry>;
  readonly data: Uint8Array;
  offset: ByteOffset;
}

/**
 * PDF字句解析器および ContentStream 解釈器が扱う全トークンの discriminated union。
 * `type` フィールドで variant を識別する。
 */
export type Token =
  | TokenBoolean
  | TokenInteger
  | TokenReal
  | TokenLiteralString
  | TokenHexString
  | TokenName
  | TokenArrayBegin
  | TokenArrayEnd
  | TokenDictBegin
  | TokenDictEnd
  | TokenNull
  | TokenKeyword
  | Operator
  | TokenInlineImage
  | TokenEOF;

/**
 * `Operator` の factory utility を束ねた companion object。
 * 型と value を同一識別子で公開する declaration merging パターン。
 */
export const Operator = {
  /**
   * Operator バリアントを生成する。検証は行わず、生 string をそのまま受け取る。
   *
   * @param name - 演算子名 (例: `BT`, `m`)
   * @param offset - バイトオフセット
   * @returns Operator バリアント
   */
  of(name: string, offset: ByteOffset): Operator {
    return { type: TokenType.Operator, name, offset };
  },
} as const;

/**
 * `Token` の domain utility を束ねた companion object。
 * 型と value を同一識別子で公開する declaration merging パターン（`Operator` と同様）。
 */
export const Token = {
  /**
   * content stream の primitive token を PdfValue へ変換する。
   *
   * interpreter のメインループと配列リテラル reader の両方から呼ばれる共有純関数。
   * 各 primitive 種別 companion の `toPdfValue` へ dispatch するだけで、変換ロジック
   * は各 sub-directory に局在化されている。primitive 7 種以外（Operator / Keyword /
   * InlineImage / Array/Dict 開閉 / EOF）は `None` を返し、複合 delimiter の拒否や
   * operator dispatch は呼び出し側の責務。
   *
   * @param token - 変換対象 token
   * @returns 変換した PdfValue、対象外 token の None、または変換エラー
   */
  toPrimitivePdfValue(token: Token): Result<Option<PdfValue>, PdfError> {
    switch (token.type) {
      case TokenType.Boolean:
        return TokenBoolean.toPdfValue(token);
      case TokenType.Integer:
        return TokenInteger.toPdfValue(token);
      case TokenType.Real:
        return TokenReal.toPdfValue(token);
      case TokenType.Name:
        return TokenName.toPdfValue(token);
      case TokenType.Null:
        return TokenNull.toPdfValue(token);
      case TokenType.LiteralString:
        return TokenLiteralString.toPdfValue(token);
      case TokenType.HexString:
        return TokenHexString.toPdfValue(token);
      default:
        return ok(none);
    }
  },
} as const;

/**
 * Token をエラーメッセージなどに埋め込むための文字列表現。
 * Operator は name、Null/EOF は "null"、それ以外は value を文字列化する。
 *
 * @param token - 表示対象のトークン
 * @returns 表示用文字列
 */
export function tokenDisplayString(token: Token): string {
  if (token.type === TokenType.Operator) {
    return token.name;
  }
  if (token.type === TokenType.InlineImage) {
    return "BI ... ID ... EI";
  }
  if (token.value === null) {
    return "null";
  }
  return String(token.value);
}
