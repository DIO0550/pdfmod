import {
  decodeHexString,
  decodeLiteralString,
} from "../../../objects/object-parser/string-decoder/index";
import type { Option } from "../../../utils/option/index";
import { none, some } from "../../../utils/option/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";
import type { PdfError } from "../../errors/index";
import type { ByteOffset } from "../byte-offset/index";
import type { PdfValue } from "../pdf-types/index";

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
   * primitive 7 種（Boolean / Integer / Real / Name / Null / LiteralString / HexString）
   * のみ `Some(PdfValue)` を返し、それ以外（Operator / Keyword / InlineImage /
   * Array/Dict 開閉 / EOF）は `None` を返す。複合 delimiter の拒否や operator
   * dispatch は呼び出し側の責務。
   *
   * @param token - 変換対象 token
   * @returns 変換した PdfValue、対象外 token の None、または変換エラー
   */
  toPrimitivePdfValue(token: Token): Result<Option<PdfValue>, PdfError> {
    switch (token.type) {
      case TokenType.Boolean:
        return ok(some({ type: "boolean", value: token.value }));
      case TokenType.Integer:
        return integerToPdfValue(token);
      case TokenType.Real:
        return realToPdfValue(token);
      case TokenType.LiteralString:
        return literalStringToPdfValue(token);
      case TokenType.HexString:
        return hexStringToPdfValue(token);
      case TokenType.Name:
        return ok(some({ type: "name", value: token.value }));
      case TokenType.Null:
        return ok(some({ type: "null" }));
      default:
        return ok(none);
    }
  },
} as const;

function integerToPdfValue(
  token: TokenInteger,
): Result<Option<PdfValue>, PdfError> {
  if (Number.isNaN(token.value)) {
    return err({
      code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
      message: `NaN integer token at offset ${token.offset}`,
      offset: token.offset,
    });
  }

  return ok(some({ type: "integer", value: token.value }));
}

function realToPdfValue(token: TokenReal): Result<Option<PdfValue>, PdfError> {
  if (Number.isNaN(token.value)) {
    return err({
      code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
      message: `NaN real token at offset ${token.offset}`,
      offset: token.offset,
    });
  }

  return ok(some({ type: "real", value: token.value }));
}

function literalStringToPdfValue(
  token: TokenLiteralString,
): Result<Option<PdfValue>, PdfError> {
  const decoded = decodeLiteralString(token.value);
  if (!decoded.ok) {
    return err({
      code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
      message: decoded.error,
      offset: token.offset,
    });
  }

  return ok(
    some({
      type: "string",
      value: decoded.value,
      encoding: "literal",
    }),
  );
}

function hexStringToPdfValue(
  token: TokenHexString,
): Result<Option<PdfValue>, PdfError> {
  const decoded = decodeHexString(token.value);
  if (!decoded.ok) {
    return err({
      code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
      message: decoded.error,
      offset: token.offset,
    });
  }

  return ok(
    some({
      type: "string",
      value: decoded.value,
      encoding: "hex",
    }),
  );
}

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
