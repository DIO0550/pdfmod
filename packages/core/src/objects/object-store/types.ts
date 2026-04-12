import type { XRefTable } from "../../types/pdf-types/index";

/**
 * ObjectStore が必要とするデータソース。
 */
export interface ObjectStoreSource {
  /** 相互参照テーブル */
  readonly xref: XRefTable;
  /** PDF バイナリデータ */
  readonly data: Uint8Array;
}

/**
 * ObjectStore の設定オプション（フラット構造）。
 * ObjStm は常時サポート。discriminated union は不要。
 */
export interface ObjectStoreOptions {
  /** 解決結果キャッシュ容量（デフォルト 1024） */
  readonly cacheCapacity?: number;
  /** ObjStm 展開済みデータキャッシュ容量（デフォルト 64、false で無効化） */
  readonly streamCacheCapacity?: number | false;
}
