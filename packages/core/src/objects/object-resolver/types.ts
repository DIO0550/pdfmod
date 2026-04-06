import type { XRefTable } from "../../types/pdf-types/index";
import type { ObjectStreamBodyDeps } from "../object-stream-extractor/index";

/**
 * ObjectResolver の設定。
 */
export interface ObjectResolverConfig {
  /** 解決結果キャッシュ容量（デフォルト 1024） */
  readonly cacheCapacity?: number;
  /** ObjStm 展開済みデータキャッシュ容量（デフォルト 64、false で無効化） */
  readonly streamCacheCapacity?: number | false;
}

/**
 * ObjectResolver が必要とするデータ依存（コンストラクタで注入）。
 */
export interface ObjectResolverDeps {
  /** 相互参照テーブル */
  readonly xref: XRefTable;
  /** PDF バイナリデータ */
  readonly data: Uint8Array;
}

/**
 * ObjectStreamBody.extract に渡す依存セット。
 * ObjectResolver が type=2 分岐で使用する。
 */
export interface ObjectStreamExtractDeps {
  readonly streamBodyDeps: ObjectStreamBodyDeps;
}

/**
 * resolveImpl に渡す呼び出しコンテキスト。
 * 解決チェーンローカルで循環検出を管理する。
 */
export interface ResolveContext {
  readonly ancestors: Set<string>;
}
