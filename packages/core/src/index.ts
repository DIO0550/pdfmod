/**
 * `@pdfmod/core` — PDF処理エンジン。
 * ISO 32000-1:2008 (PDF 1.7) 準拠のPDF字句解析・構造解析を提供する。
 *
 * @packageDocumentation
 */

export {
  GraphicsState,
  GraphicsStateStack,
} from "./content-stream/graphics-state/index";
export type {
  ContentStreamInterpreterExecuteOptions,
  ContentStreamInterpreterResult,
} from "./content-stream/interpreter/index";
export { ContentStreamInterpreter } from "./content-stream/interpreter/index";
export { OperandStack } from "./content-stream/operand-stack/index";
export type {
  OperatorHandler,
  OperatorHandlerContext,
} from "./content-stream/operator-registry/index";
export { OperatorRegistry } from "./content-stream/operator-registry/index";
export { ContentStreamTokenizer } from "./content-stream/tokenizer/index";
export type {
  DocumentMetadata,
  InheritedAttrs,
  LoadOptions,
  PageRotate,
  ParsedCatalog,
  ParsedDocumentInfo,
  PdfDocumentLoadError,
  PdfPageRectangle,
  PdfRectangle,
  ResolvedPage,
  ResolveInheritedOutcome,
  ResolveRef,
  WalkPageTreeResult,
} from "./document/index";
export {
  CatalogParser,
  DocumentInfoParser,
  InheritanceResolver,
  PageTreeWalker,
  PdfDocument,
  PdfPage,
  PdfTrapped,
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
  PdfInlineImageRequiredKeyMissingError,
  PdfInteger,
  PdfName,
  PdfNull,
  PdfObject,
  PdfOperatorIllegalStateError,
  PdfOperatorOperandMissingError,
  PdfOperatorOperandTypeMismatchError,
  PdfOperatorOperandValueOutOfRangeError,
  PdfOperatorPathNoCurrentPointError,
  PdfOperatorRegistryError,
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
  Operator,
  PdfVersion,
  TokenType,
} from "./pdf/index";
export type { Brand } from "./utils/index";
export * as Option from "./utils/option/index";
export * as Result from "./utils/result/index";
export type { FallbackScanResult } from "./xref/index";
export {
  parseTrailer,
  parseXRefTable,
  scanFallback,
  scanStartXRef,
} from "./xref/index";
