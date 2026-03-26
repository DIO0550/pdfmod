/**
 * `@pdfmod/core` — PDF処理エンジン。
 * ISO 32000-1:2008 (PDF 1.7) 準拠のPDF字句解析・構造解析を提供する。
 *
 * @packageDocumentation
 */
export type {
  PdfCircularReferenceError,
  PdfError,
  PdfErrorCode,
  PdfParseError,
  PdfParseErrorCode,
  PdfTypeMismatchError,
  PdfWarning,
  PdfWarningCode,
} from "./errors/index";
export { Tokenizer } from "./lexer/index";
export { LRUCache } from "./objects/index";
export * as Option from "./option/index";
export * as Result from "./result/index";
export type {
  Brand,
  ByteOffset,
  GenerationNumber,
  IndirectRef,
  ObjectId,
  ObjectNumber,
  PdfDictionary,
  PdfObject,
  Token,
  TrailerDict,
  XRefEntry,
  XRefTable,
} from "./types/index";
export { TokenType } from "./types/index";
export { parseTrailer, parseXRefTable, scanStartXRef } from "./xref/index";
