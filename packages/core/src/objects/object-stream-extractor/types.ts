import type { PdfError } from "../../pdf/errors/index";
import type { ObjectNumber } from "../../pdf/types/object-number/index";
import type { PdfObject } from "../../pdf/types/pdf-types/index";
import type { Result } from "../../utils/result/index";

/**
 * ストリームオブジェクトを解決するインタフェース。
 * 具象実装を ObjectStreamBody に注入して使用する。
 */
export interface StreamResolver {
  resolve(objNum: ObjectNumber): Promise<Result<PdfObject, PdfError>>;
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
