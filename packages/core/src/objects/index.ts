/**
 * PDFオブジェクト管理モジュール。
 * LRUキャッシュによるオブジェクトキャッシング機能と、
 * オブジェクトストリーム（ObjStm）からのオブジェクト抽出機能を提供する。
 */
export { LRUCache } from "./lru-cache/index";
export type {
  CreateFlateDecompressorOptions,
  ObjectStreamExtractorDeps,
  ObjectStreamHeaderEntry,
  StreamDecompressor,
  StreamObjectParser,
  StreamResolver,
} from "./object-stream-extractor/index";
export {
  createFlateDecompressor,
  DEFAULT_OBJECT_STREAM_MAX_DECOMPRESSED_SIZE,
  ObjectStreamExtractor,
  ObjectStreamHeader,
} from "./object-stream-extractor/index";
