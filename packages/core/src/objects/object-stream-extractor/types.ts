import type { PdfError, PdfParseError } from "../../errors/index";
import type { Result } from "../../result/index";
import type { ObjectNumber } from "../../types/object-number/index";
import type { PdfObject } from "../../types/pdf-types/index";

/**
 * ストリームオブジェクトを解決するインタフェース。
 * 具象実装を ObjectStreamBody に注入して使用する。
 */
export interface StreamResolver {
  resolve(objNum: ObjectNumber): Promise<Result<PdfObject, PdfError>>;
}

/**
 * ストリーム内オブジェクトをパースするインタフェース。
 * data の offset 位置から1オブジェクトを読み取って返す。
 */
export interface StreamObjectParser {
  parse(data: Uint8Array, offset: number): Result<PdfObject, PdfParseError>;
}

/**
 * ストリームデータを展開するインタフェース。
 */
export interface StreamDecompressor {
  decompress(data: Uint8Array): Promise<Result<Uint8Array, PdfParseError>>;
}

/**
 * ObjectStreamBody の依存を束ねる型。
 */
export interface ObjectStreamBodyDeps {
  readonly resolver: StreamResolver;
  readonly parser: StreamObjectParser;
  readonly decompressor: StreamDecompressor;
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
