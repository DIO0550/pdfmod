import type { PdfError } from "../../../errors/index";
import type { Result } from "../../../utils/result/index";
import type { ObjectNumber } from "../../../types/object-number/index";
import type {
  IndirectRef,
  PdfValue,
  XRefCompressedEntry,
} from "../../../types/pdf-types/index";
import type { LRUCache } from "../../lru-cache/index";
import type { StreamResolver } from "../../object-stream-extractor/index";
import { ObjectStreamBody } from "../../object-stream-extractor/index";

/**
 * type=2 の XRefCompressedEntry を読み取り、ObjStm からオブジェクトを抽出する。
 *
 * @param resolver - ObjectStore が生成した StreamResolver adapter
 * @param cache - ストリームキャッシュ（ObjectStore が保有し渡す）
 * @param ref - 解決対象の間接参照
 * @param entry - type=2 の XRefEntry（streamObject, indexInStream）
 * @returns 抽出された PdfValue、またはエラー
 */
export async function readObjectStreamEntry(
  resolver: StreamResolver,
  cache: LRUCache<ObjectNumber, Uint8Array> | undefined,
  ref: IndirectRef,
  entry: XRefCompressedEntry,
): Promise<Result<PdfValue, PdfError>> {
  return ObjectStreamBody.extract(
    resolver,
    cache,
    ref.objectNumber,
    entry.streamObject,
    entry.indexInStream,
  );
}
