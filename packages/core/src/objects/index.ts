/**
 * PDFオブジェクト管理モジュール。
 * LRUキャッシュによるオブジェクトキャッシング機能と、
 * オブジェクトストリーム（ObjStm）からのオブジェクト抽出機能を提供する。
 */
export { LRUCache } from "./lru-cache/index";
export type { ObjectResolver } from "./object-parser/index";
export { ObjectParser } from "./object-parser/index";
export { ObjectStore } from "./object-store/index";
export type {
  ObjectStoreOptions,
  ObjectStoreSource,
} from "./object-store/types";
export type {
  ObjectStreamHeaderEntry,
  StreamResolver,
} from "./object-stream-extractor/index";
export {
  ObjectStreamBody,
  ObjectStreamHeader,
} from "./object-stream-extractor/index";
