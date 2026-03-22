/**
 * PDFエラー型と警告型を提供するモジュール。
 * 致命的エラー（パースエラー、循環参照、型不一致）と回復可能な警告を定義する。
 */
export type {
  PdfCircularReferenceError,
  PdfError,
  PdfErrorCode,
  PdfParseError,
  PdfParseErrorCode,
  PdfTypeMismatchError,
} from "./pdf-error.js";
export type { PdfWarning, PdfWarningCode } from "./pdf-warning.js";
