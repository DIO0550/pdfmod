import type { PdfParseError } from "../../../errors/index";
import type { Result } from "../../../utils/result/index";
import { decompressFlate } from "../../../xref/stream/flatedecode/index";
import type { CreateFlateDecompressorOptions } from "../types";

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;
const DEFAULT_OBJECT_STREAM_MAX_DECOMPRESSED_MB = 8;

/**
 * ObjStm の展開サイズ上限のデフォルト値（バイト）。
 * 汎用の FlateDecode デフォルト値には依存せず、Object Stream 用に
 * より小さな上限を明示してメモリ使用量を抑制する。
 */
export const DEFAULT_OBJECT_STREAM_MAX_DECOMPRESSED_SIZE =
  DEFAULT_OBJECT_STREAM_MAX_DECOMPRESSED_MB * BYTES_PER_MB;

/**
 * FlateDecode アダプタ。
 * decompressFlate をラップして ObjStm 展開用のインタフェースに適合させる。
 *
 * @param options - アダプタ生成オプション
 * @returns decompress メソッドを持つオブジェクト
 */
export const createFlateDecompressor = (
  options: CreateFlateDecompressorOptions = {},
): {
  decompress(data: Uint8Array): Promise<Result<Uint8Array, PdfParseError>>;
} => {
  const maxDecompressedSize =
    options.maxDecompressedSize ?? DEFAULT_OBJECT_STREAM_MAX_DECOMPRESSED_SIZE;

  return {
    /** @param data - 圧縮されたストリームバイト列 */
    decompress: (data: Uint8Array) =>
      decompressFlate(data, maxDecompressedSize),
  };
};
