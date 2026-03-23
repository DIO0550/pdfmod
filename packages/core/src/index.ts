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
} from "./errors/index.js";
export { Tokenizer } from "./lexer/index.js";
export { LRUCache } from "./objects/index.js";
export * as Option from "./option/index.js";
export * as Result from "./result/index.js";
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
} from "./types/index.js";
export { TokenType } from "./types/index.js";
export { parseXRefTable, scanStartXRef } from "./xref/index.js";
