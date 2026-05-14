/**
 * PDF オブジェクト (`PdfObject`) を扱う低レベル変換層。
 * xref テーブル直下に位置し、上層の `document/pdf-document` から利用される。
 *
 * 配下には責務の異なる 3 兄弟モジュールがある:
 *
 * | モジュール | 責務 (2 行) |
 * |---|---|
 * | `object-parser` | `Uint8Array` + `ByteOffset` から `PdfObject` / `PdfIndirectObject` を 1 個構文解析する低レベルパーサ。xref を参照せず、stream の `/Length` が間接参照の場合だけ `ObjectResolver` コールバックで解決する。 |
 * | `object-store` | `IndirectRef` を実体 `PdfObject` に解決する高レベル窓口。`XRefTable` のエントリ type を見て inline (type=1) は `object-parser`、ObjStm (type=2) は `object-stream-extractor` に dispatch し、LRU キャッシュと循環参照検出を提供する。 |
 * | `object-stream-extractor` | オブジェクトストリーム (`/Type /ObjStm`, ISO 32000-1 §7.5.7) の中身から指定 `ObjectNumber` のオブジェクトを切り出すモジュール。辞書検証 (`/First` / `/N` / `/Filter`) → 必要に応じて FlateDecode 展開 → オフセットテーブル (`ObjectStreamHeader`) パース → 単位データの再パース (`ObjectParser.parse`) を担う。 |
 *
 * 補助モジュールとして `lru-cache/` を併設し、`object-store` のメモ化に使う。
 *
 * @module
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
