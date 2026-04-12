/**
 * PDFオブジェクト管理モジュール。
 * LRUキャッシュによるオブジェクトキャッシング機能と、
 * オブジェクトストリーム（ObjStm）からのオブジェクト抽出機能を提供する。
 */
export { LRUCache } from "./lru-cache/index";
export type {
  IndirectObjectResult,
  ResolveLength,
} from "./object-parser/index";
export { ObjectParser } from "./object-parser/index";
export { ObjectResolver } from "./object-resolver/index";
export type {
  ObjectResolverConfig,
  ObjectResolverDeps,
} from "./object-resolver/types";
export type {
  ObjectStreamHeaderEntry,
  StreamResolver,
} from "./object-stream-extractor/index";
export {
  ObjectStreamBody,
  ObjectStreamHeader,
} from "./object-stream-extractor/index";
