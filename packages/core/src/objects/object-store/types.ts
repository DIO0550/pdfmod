import type { PdfWarning } from "../../pdf/errors/index";
import type { XRefTable } from "../../pdf/types/pdf-types/index";

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
  /** 回復可能な警告を受け取るコールバック（未指定時は警告を破棄する） */
  readonly onWarning?: (warning: PdfWarning) => void;
}
