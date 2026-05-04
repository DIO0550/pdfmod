import type { ByteOffset } from "../byte-offset/index";

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
  EOF = "EOF",
}

/**
 * Boolean リテラル (`true` / `false`) トークン。
 */
export interface TokenBoolean {
  type: TokenType.Boolean;
  value: boolean;
  offset: ByteOffset;
}

/**
 * 整数リテラル (`123`, `-7`) トークン。
 */
export interface TokenInteger {
  type: TokenType.Integer;
  value: number;
  offset: ByteOffset;
}

/**
 * 実数リテラル (`3.14`, `.5`) トークン。
 */
export interface TokenReal {
  type: TokenType.Real;
  value: number;
  offset: ByteOffset;
}

/**
 * リテラル文字列 (`(...)`) トークン。
 */
export interface TokenLiteralString {
  type: TokenType.LiteralString;
  value: string;
  offset: ByteOffset;
}

/**
 * 16進文字列 (`<...>`) トークン。
 */
export interface TokenHexString {
  type: TokenType.HexString;
  value: string;
  offset: ByteOffset;
}

/**
 * 名前オブジェクト (`/Name`) トークン。
 */
export interface TokenName {
  type: TokenType.Name;
  value: string;
  offset: ByteOffset;
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
 * `null` リテラルトークン。
 * PDF 仕様の `null` オブジェクトを保持するため、value は `null` 固定。
 */
export interface TokenNull {
  type: TokenType.Null;
  value: null;
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
  | TokenEOF;

const OperatorCompanion = {
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
 * `Operator` の factory utility を束ねた companion object。
 * 型と value を同一識別子で公開する declaration merging パターン。
 */
export const Operator = OperatorCompanion;

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
  if (token.value === null) {
    return "null";
  }
  return String(token.value);
}
