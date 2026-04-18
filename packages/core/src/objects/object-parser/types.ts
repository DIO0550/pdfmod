import type { PdfError } from "../../pdf/errors/index";
import type { ByteOffset } from "../../pdf/types/byte-offset/index";
import type { GenerationNumber } from "../../pdf/types/generation-number/index";
import type { ObjectNumber } from "../../pdf/types/object-number/index";
import type {
  PdfIndirectRef,
  PdfObject,
  PdfStream,
} from "../../pdf/types/pdf-types/index";
import type { Result } from "../../utils/result/index";

/**
 * 間接参照をオブジェクトに解決するコールバック。
 *
 * object-parser 内では stream の `/Length` が間接参照の場合の解決にのみ使用される。
 * 他の間接参照（配列要素・辞書値の `indirect-ref`）は `PdfIndirectRef` のまま呼び出し側に返され、
 * 利用側で xref 経由で解決する（遅延解決）。
 */
export type ObjectResolver = (
  objectNumber: ObjectNumber,
  generationNumber: GenerationNumber,
) => Promise<Result<PdfObject, PdfError>>;

/**
 * stream 辞書の /Length エントリの解決前の値。
 * direct（直値）か indirect（参照）かを型で区別する。
 */
export type StreamLength =
  | { kind: "direct"; value: number }
  | { kind: "indirect"; ref: PdfIndirectRef };

/**
 * stream データ抽出の結果。
 */
export interface StreamExtractResult {
  readonly object: PdfStream;
  readonly afterEndstreamAbsPos: ByteOffset;
}
