/**
 * `@pdfmod/core` — PDF処理エンジン。
 * ISO 32000-1:2008 (PDF 1.7) 準拠のPDF字句解析・構造解析を提供する。
 *
 * @packageDocumentation
 */

export type {
  InheritedAttrs,
  PageRotate,
  ParsedCatalog,
  PdfRectangle,
  ResolvedPage,
  ResolveInheritedOutcome,
  ResolveRef,
  WalkPageTreeResult,
} from "./document/index";
export {
  CatalogParser,
  InheritanceResolver,
  PageTreeWalker,
} from "./document/index";
export { NumberEx } from "./ext/number/index";
export { Tokenizer } from "./lexer/index";
export type {
  ObjectResolver,
  ObjectStoreOptions,
  ObjectStoreSource,
  ObjectStreamHeaderEntry,
  StreamResolver,
} from "./objects/index";
export {
  LRUCache,
  ObjectParser,
  ObjectStore,
  ObjectStreamBody,
  ObjectStreamHeader,
} from "./objects/index";
export type {
  ObjectId,
  PdfArray,
  PdfBoolean,
  PdfCircularReferenceError,
  PdfDictionary,
  PdfError,
  PdfErrorCode,
  PdfIndirectObject,
  PdfIndirectRef,
  PdfInteger,
  PdfName,
  PdfNull,
  PdfObject,
  PdfParseError,
  PdfParseErrorCode,
  PdfReal,
  PdfStream,
  PdfString,
  PdfTypeMismatchError,
  PdfValue,
  PdfWarning,
  PdfWarningCode,
  Token,
  TrailerDict,
  XRefCompressedEntry,
  XRefEntry,
  XRefFreeEntry,
  XRefTable,
  XRefUsedEntry,
} from "./pdf/index";
export {
  ByteOffset,
  GenerationNumber,
  IndirectRef,
  ObjectNumber,
  PdfVersion,
  TokenType,
} from "./pdf/index";
export type { Brand } from "./utils/index";
export * as Option from "./utils/option/index";
export * as Result from "./utils/result/index";
export { parseTrailer, parseXRefTable, scanStartXRef } from "./xref/index";
