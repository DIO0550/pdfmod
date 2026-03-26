import type { ObjectId } from "../types/index";

/**
 * PDFパースエラーのエラーコード。
 * 構造的・構文的な問題を分類する。
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
  | "ROOT_NOT_FOUND"
  | "SIZE_NOT_FOUND"
  | "MEDIABOX_NOT_FOUND"
  | "NESTING_TOO_DEEP";

/**
 * 全致命的PDFエラーコードの共用体型。
 * パースエラーコードに加え、循環参照・型不一致を含む。
 *
 * @example
 * ```ts
 * const code: PdfErrorCode = "CIRCULAR_REFERENCE";
 * ```
 */
export type PdfErrorCode =
  | PdfParseErrorCode
  | "CIRCULAR_REFERENCE"
  | "TYPE_MISMATCH";

/**
 * PDFパースエラーを表すインターフェース。
 * パース処理で発生した回復不能な構造的・構文的問題の種別とメッセージを保持する。
 *
 * @example
 * ```ts
 * const error: PdfParseError = {
 *   code: "STARTXREF_NOT_FOUND",
 *   message: "startxrefキーワードが見つかりません",
 *   offset: 1024,
 * };
 * ```
 */
export interface PdfParseError {
  /** エラーコード */
  readonly code: PdfParseErrorCode;
  /** 人間可読なエラーメッセージ */
  readonly message: string;
  /** 問題が検出されたバイトオフセット */
  readonly offset?: number;
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
 * 全致命的PDFエラーの判別共用体型。
 * パースエラー、循環参照エラー、型不一致エラーを包含する。
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
  | PdfTypeMismatchError;
