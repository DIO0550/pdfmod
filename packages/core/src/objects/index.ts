/**
 * PDFオブジェクト管理モジュール。
 * LRUキャッシュによるオブジェクトキャッシング機能を提供する。
 */
export { LRUCache } from "./lru-cache/index";
export type {
  HeaderEntry,
  ObjectStreamExtractorDeps,
  StreamDecompressor,
  StreamObjectParser,
  StreamResolver,
  ValidatedStreamDict,
} from "./object-stream-extractor/index";
export {
  createFlateDecompressor,
  ObjectStreamExtractor,
  parseHeader,
  validateStreamDict,
} from "./object-stream-extractor/index";
