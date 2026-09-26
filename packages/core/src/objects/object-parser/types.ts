import type { ByteOffset } from "../../pdf/types/byte-offset/index";
import type {
  PdfIndirectRef,
  PdfStream,
} from "../../pdf/types/pdf-types/index";

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
