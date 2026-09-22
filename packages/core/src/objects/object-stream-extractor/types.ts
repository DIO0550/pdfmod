import type { ObjectNumber } from "../../pdf/types/object-number/index";
import type { PdfStream } from "../../pdf/types/pdf-types/index";
import type { LRUCache } from "../lru-cache/index";

/**
 * オブジェクトストリームからの抽出オプション。
 */
export interface ObjectStreamExtractOptions {
  /** 対象のオブジェクトストリーム。 */
  readonly stream: PdfStream;
  /** 抽出対象のオブジェクト番号。 */
  readonly targetObjNum: ObjectNumber;
  /** オブジェクトストリーム自体のオブジェクト番号（キャッシュキー用）。 */
  readonly streamObjNum: ObjectNumber;
  /** オブジェクトストリーム内でのインデックス（0始まり）。 */
  readonly indexInStream: number;
  /** 展開済みストリームのキャッシュ（省略時はキャッシュ無効）。 */
  readonly cache?: LRUCache<ObjectNumber, Uint8Array>;
}

/**
 * FlateDecode アダプタの生成オプション。
 */
export interface CreateFlateDecompressorOptions {
  /**
   * 展開後データの最大サイズ（バイト）。
   * 未指定時は ObjStm 向けの安全なデフォルト上限を使用する。
   */
  readonly maxDecompressedSize?: number;
}
