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
export { NumberEx } from "./number-ex/index";
export type {
  IndirectObjectResult,
  ObjectResolverConfig,
  ObjectResolverDeps,
  ObjectStreamHeaderEntry,
  ResolveLength,
  StreamResolver,
} from "./objects/index";
export {
  LRUCache,
  ObjectParser,
  ObjectResolver,
  ObjectStreamBody,
  ObjectStreamHeader,
} from "./objects/index";
export * as Option from "./option/index";
export * as Result from "./result/index";
export type {
  Brand,
  IndirectRef,
  ObjectId,
  PdfDictionary,
  PdfObject,
  Token,
  TrailerDict,
  XRefCompressedEntry,
  XRefEntry,
  XRefFreeEntry,
  XRefTable,
  XRefUsedEntry,
} from "./types/index";
export {
  ByteOffset,
  GenerationNumber,
  ObjectNumber,
  TokenType,
} from "./types/index";
export { parseTrailer, parseXRefTable, scanStartXRef } from "./xref/index";
