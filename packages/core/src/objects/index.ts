/**
 * PDFオブジェクト管理モジュール。
 * LRUキャッシュによるオブジェクトキャッシング機能と、
 * オブジェクトストリーム（ObjStm）からのオブジェクト抽出機能を提供する。
 */
export { LRUCache } from "./lru-cache/index";
export type {
  ObjectStreamExtractorDeps,
  ObjectStreamHeader,
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
