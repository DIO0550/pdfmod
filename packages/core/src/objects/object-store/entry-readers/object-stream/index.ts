import type { PdfError } from "../../../../pdf/errors/index";
import type { ObjectNumber } from "../../../../pdf/types/object-number/index";
import type {
  IndirectRef,
  PdfStream,
  PdfValue,
  XRefCompressedEntry,
} from "../../../../pdf/types/pdf-types/index";
import type { Result } from "../../../../utils/result/index";
import type { LRUCache } from "../../../lru-cache/index";
import { ObjectStreamBody } from "../../../object-stream-extractor/index";

/**
 * readObjectStreamEntry の実行オプション。
 */
export interface ReadObjectStreamEntryOptions {
  /** 解決済みのオブジェクトストリーム。 */
  readonly stream: PdfStream;
  /** 解決対象の間接参照（targetObjNum を提供）。 */
  readonly ref: IndirectRef;
  /** type=2 の XRefEntry（streamObject, indexInStream）。 */
  readonly entry: XRefCompressedEntry;
  /** 展開済みストリームキャッシュ。 */
  readonly cache?: LRUCache<ObjectNumber, Uint8Array>;
}

/**
 * XRefCompressedEntry（type=2）を読み取る。
 *
 * @param options - 解決済みストリームおよび抽出パラメータ
 * @returns 解決された PDF オブジェクト、またはエラー
 */
export async function readObjectStreamEntry(
  options: ReadObjectStreamEntryOptions,
): Promise<Result<PdfValue, PdfError>> {
  return ObjectStreamBody.extract({
    stream: options.stream,
    targetObjNum: options.ref.objectNumber,
    streamObjNum: options.entry.streamObject,
    indexInStream: options.entry.indexInStream,
    cache: options.cache,
  });
}
