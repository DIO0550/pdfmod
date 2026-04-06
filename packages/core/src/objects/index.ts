/**
 * PDFオブジェクト管理モジュール。
 * LRUキャッシュによるオブジェクトキャッシング機能と、
 * オブジェクトストリーム（ObjStm）からのオブジェクト抽出機能を提供する。
 */
export { LRUCache } from "./lru-cache/index";
export { ObjectResolver } from "./object-resolver/index";
export type {
  ObjectResolverConfig,
  ObjectResolverDeps,
  ObjectStreamExtractDeps,
} from "./object-resolver/types";
export type {
  CreateFlateDecompressorOptions,
  ObjectStreamBodyDeps,
  ObjectStreamHeaderEntry,
  StreamDecompressor,
  StreamObjectParser,
  StreamResolver,
} from "./object-stream-extractor/index";
export {
  createFlateDecompressor,
  DEFAULT_OBJECT_STREAM_MAX_DECOMPRESSED_SIZE,
  ObjectStreamBody,
  ObjectStreamHeader,
} from "./object-stream-extractor/index";
