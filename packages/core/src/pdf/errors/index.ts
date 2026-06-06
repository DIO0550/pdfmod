/**
 * PDFエラー型と警告型を提供するモジュール。
 * 致命的エラー（パースエラー、循環参照、型不一致、operator registry エラー）と
 * 回復可能な警告を定義する。
 */
export type {
  PdfCircularReferenceError,
  PdfError,
  PdfErrorCode,
  PdfOperatorIllegalStateError,
  PdfOperatorOperandMissingError,
  PdfOperatorOperandTypeMismatchError,
  PdfOperatorOperandValueOutOfRangeError,
  PdfOperatorPathNoCurrentPointError,
  PdfOperatorRegistryError,
  PdfParseError,
  PdfParseErrorCode,
  PdfTypeMismatchError,
} from "./error/index";
export type { PdfWarning, PdfWarningCode } from "./warning/index";
