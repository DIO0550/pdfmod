import type { ByteOffset } from "../../types/byte-offset/index";
import type { ObjectId } from "../../types/index";

/**
 * PDFパースエラーのエラーコード。
 * 構造的・構文的な問題、および未実装機能など実装側都合の致命的エラーを分類する。
 *
 * @example
 * ```ts
 * const code: PdfParseErrorCode = "STARTXREF_NOT_FOUND";
 * ```
 */
export type PdfParseErrorCode =
  | "INVALID_HEADER"
  | "STARTXREF_NOT_FOUND"
  | "XREF_TABLE_INVALID"
  | "XREF_STREAM_INVALID"
  | "XREF_PREV_CHAIN_CYCLE"
  | "XREF_PREV_CHAIN_TOO_DEEP"
  | "TRAILER_DICT_INVALID"
  | "ROOT_NOT_FOUND"
  | "SIZE_NOT_FOUND"
  | "MEDIABOX_NOT_FOUND"
  | "NESTING_TOO_DEEP"
  | "FLATEDECODE_FAILED"
  | "PDF_TYPE_INVALID"
  | "PDF_FILTER_UNSUPPORTED"
  | "OBJECT_STREAM_INVALID"
  | "OBJECT_STREAM_INDEX_OUT_OF_RANGE"
  | "OBJECT_STREAM_HEADER_INVALID"
  | "OBJECT_PARSE_UNEXPECTED_TOKEN"
  | "OBJECT_PARSE_UNTERMINATED"
  | "OBJECT_PARSE_STREAM_LENGTH"
  | "CONTENT_STREAM_INLINE_IMAGE_INVALID"
  | "TOKENIZER_POSITION_OUT_OF_RANGE"
  | "CATALOG_TYPE_INVALID"
  | "PAGES_NOT_FOUND"
  | "CATALOG_ROOT_NOT_DICTIONARY"
  | "NOT_IMPLEMENTED";

/**
 * 全致命的PDFエラーコードの共用体型。
 * パースエラーコードに加え、循環参照・型不一致・operator registry エラーを含む。
 *
 * @example
 * ```ts
 * const code: PdfErrorCode = "CIRCULAR_REFERENCE";
 * ```
 */
export type PdfErrorCode =
  | PdfParseErrorCode
  | "CIRCULAR_REFERENCE"
  | "TYPE_MISMATCH"
  | "OPERATOR_ALREADY_REGISTERED"
  | "OPERATOR_OPERAND_MISSING"
  | "OPERATOR_OPERAND_TYPE_MISMATCH";

/**
 * PDFパースエラーを表すインターフェース。
 * パース処理で発生した回復不能な構造的・構文的問題の種別とメッセージを保持する。
 *
 * @example
 * ```ts
 * const error: PdfParseError = {
 *   code: "STARTXREF_NOT_FOUND",
 *   message: "startxrefキーワードが見つかりません",
 *   offset: ByteOffset.of(1024),
 * };
 * ```
 */
export interface PdfParseError {
  /** エラーコード */
  readonly code: PdfParseErrorCode;
  /** 人間可読なエラーメッセージ */
  readonly message: string;
  /** 問題が検出されたバイトオフセット */
  readonly offset?: ByteOffset;
}

/**
 * オブジェクト解決時の循環参照エラー。
 * 間接オブジェクトの参照が循環している場合に発生する。
 *
 * @example
 * ```ts
 * const error: PdfCircularReferenceError = {
 *   code: "CIRCULAR_REFERENCE",
 *   message: "循環参照を検出しました",
 *   objectId: { objectNumber: 5, generationNumber: 0 },
 * };
 * ```
 */
export interface PdfCircularReferenceError {
  /** エラーコード（常に "CIRCULAR_REFERENCE"） */
  readonly code: "CIRCULAR_REFERENCE";
  /** 人間可読なエラーメッセージ */
  readonly message: string;
  /** 循環参照が検出されたオブジェクトの識別子 */
  readonly objectId: ObjectId;
}

/**
 * PDFオブジェクトの型不一致エラー。
 * 期待される型と実際の型が一致しない場合に発生する。
 *
 * @example
 * ```ts
 * const error: PdfTypeMismatchError = {
 *   code: "TYPE_MISMATCH",
 *   message: "期待: dictionary, 実際: array",
 *   expected: "dictionary",
 *   actual: "array",
 * };
 * ```
 */
export interface PdfTypeMismatchError {
  /** エラーコード（常に "TYPE_MISMATCH"） */
  readonly code: "TYPE_MISMATCH";
  /** 人間可読なエラーメッセージ */
  readonly message: string;
  /** 期待されるオブジェクト型 */
  readonly expected: string;
  /** 実際のオブジェクト型 */
  readonly actual: string;
}

/**
 * Content stream operator registry の登録エラー。
 * 同じ operator 名に複数 handler を登録しようとした場合に発生する。
 */
export interface PdfOperatorRegistryError {
  /** エラーコード（常に "OPERATOR_ALREADY_REGISTERED"） */
  readonly code: "OPERATOR_ALREADY_REGISTERED";
  /** 人間可読なエラーメッセージ */
  readonly message: string;
  /** 重複登録された operator 名 */
  readonly operatorName: string;
}

/**
 * Content stream operator のオペランド不足エラー。
 * handler が必要とする数のオペランドが operand stack に積まれていない場合に発生する。
 *
 * @example
 * ```ts
 * const error: PdfOperatorOperandMissingError = {
 *   code: "OPERATOR_OPERAND_MISSING",
 *   message: "Operator 'w' requires 1 operand(s), got 0",
 *   operatorName: "w",
 *   required: 1,
 *   actual: 0,
 * };
 * ```
 */
export interface PdfOperatorOperandMissingError {
  /** エラーコード（常に "OPERATOR_OPERAND_MISSING"） */
  readonly code: "OPERATOR_OPERAND_MISSING";
  /** 人間可読なエラーメッセージ */
  readonly message: string;
  /** 不足を検出した operator 名 */
  readonly operatorName: string;
  /** handler が必要とするオペランド数 */
  readonly required: number;
  /** 実際に存在したオペランド数 */
  readonly actual: number;
}

/**
 * Content stream operator のオペランド型不一致エラー。
 * pop した PdfObject の `type` が handler の期待する型と一致しない場合に発生する。
 *
 * @example
 * ```ts
 * const error: PdfOperatorOperandTypeMismatchError = {
 *   code: "OPERATOR_OPERAND_TYPE_MISMATCH",
 *   message: "Operator 'w' expected number operand, got name",
 *   operatorName: "w",
 *   expected: "number",
 *   actual: "name",
 * };
 * ```
 */
export interface PdfOperatorOperandTypeMismatchError {
  /** エラーコード（常に "OPERATOR_OPERAND_TYPE_MISMATCH"） */
  readonly code: "OPERATOR_OPERAND_TYPE_MISMATCH";
  /** 人間可読なエラーメッセージ */
  readonly message: string;
  /** 不一致を検出した operator 名 */
  readonly operatorName: string;
  /** 期待されるオペランド型（例: "number"） */
  readonly expected: string;
  /** 実際の `PdfObject['type']` 値（例: "name" / "boolean"） */
  readonly actual: string;
}

/**
 * 全致命的PDFエラーの判別共用体型。
 * パースエラー、循環参照エラー、型不一致エラー、operator registry エラーを包含する。
 *
 * @example
 * ```ts
 * function handleError(error: PdfError): string {
 *   switch (error.code) {
 *     case "CIRCULAR_REFERENCE":
 *       return `循環参照: ${error.objectId.objectNumber}`;
 *     default:
 *       return error.message;
 *   }
 * }
 * ```
 */
export type PdfError =
  | PdfParseError
  | PdfCircularReferenceError
  | PdfTypeMismatchError
  | PdfOperatorRegistryError
  | PdfOperatorOperandMissingError
  | PdfOperatorOperandTypeMismatchError;
