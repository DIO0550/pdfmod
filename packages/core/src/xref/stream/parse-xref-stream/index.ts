/**
 * クロスリファレンスストリーム（`/Type /XRef`, ISO 32000-1 §7.5.8）を1つの間接オブジェクトの
 * オフセットからパースし、`XRefTable` と `TrailerDict` を組み立てるオーケストレーション関数。
 *
 * `ObjectParser.parseIndirectObject` → `XRefStreamDict.parse` →
 * （`/Filter` があれば）`decompressFlate` → `Predictor.apply` →
 * `decodeXRefStreamEntries` → `buildXRefStreamTrailerDict` の順に処理を結線する。
 *
 * @module
 */

import { ObjectParser } from "../../../objects/object-parser/index";
import type { PdfError } from "../../../pdf/errors/index";
import type { ByteOffset } from "../../../pdf/types/byte-offset/index";
import type { TrailerDict, XRefTable } from "../../../pdf/types/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";
import { XRefStreamDict } from "../dict/index";
import { decompressFlate } from "../flatedecode/index";
import { decodeXRefStreamEntries } from "../parser/index";
import { Predictor } from "../predictor/index";
import { buildXRefStreamTrailerDict } from "../trailer/index";

const FLATE_DECODE_FILTER_NAME = "FlateDecode";

/**
 * 指定オフセットの間接オブジェクトを xref ストリームとしてパースする。
 *
 * `/XRefStm`（ISO 32000-1 §7.5.8.4）が指す補助クロスリファレンスストリームは
 * `/Root` を持たないことがある（本来の文書 trailer はテキストセクション側が
 * 供給するため）。この場合 `buildXRefStreamTrailerDict` は `ROOT_NOT_FOUND` を
 * 返すが、それ自体は致命的エラーとせず `trailer: undefined` を返す。それ以外の
 * trailer 構築エラー（`/Prev` 等の既存オプションフィールドが不正な場合）は
 * 引き続き `Err` として伝播する。
 *
 * @param data - PDF ファイル全体のバイト配列
 * @param offset - xref ストリームを定義する間接オブジェクトの開始バイトオフセット
 * @returns 成功時は `Ok<{ xref, trailer }>`（`trailer` は `/Root` 欠如時 `undefined`）、
 *   失敗時は `Err<PdfError>`
 */
export async function parseXRefStream(
  data: Uint8Array,
  offset: ByteOffset,
): Promise<
  Result<{ xref: XRefTable; trailer: TrailerDict | undefined }, PdfError>
> {
  const objectResult = await ObjectParser.parseIndirectObject(data, offset);
  if (!objectResult.ok) {
    return objectResult;
  }

  const { body } = objectResult.value;
  if (body.type !== "stream") {
    return err({
      code: "XREF_STREAM_INVALID",
      message: `expected a stream object at offset ${String(offset)}, got ${body.type}`,
      offset,
    });
  }

  const dictInfoResult = XRefStreamDict.parse(body.dictionary.entries);
  if (!dictInfoResult.ok) {
    return dictInfoResult;
  }
  const dictInfo = dictInfoResult.value;

  let streamData = body.data;
  if (dictInfo.filterName === FLATE_DECODE_FILTER_NAME) {
    const decompressResult = await decompressFlate(streamData);
    if (!decompressResult.ok) {
      return decompressResult;
    }
    streamData = decompressResult.value;
  }

  const predictorParamsResult = Predictor.parseParams(dictInfo.decodeParms);
  if (!predictorParamsResult.ok) {
    return predictorParamsResult;
  }

  const predictedResult = Predictor.apply(
    streamData,
    predictorParamsResult.value,
  );
  if (!predictedResult.ok) {
    return predictedResult;
  }

  const entriesResult = decodeXRefStreamEntries({
    data: predictedResult.value,
    w: dictInfo.w,
    size: dictInfo.size,
    index: dictInfo.index,
  });
  if (!entriesResult.ok) {
    return entriesResult;
  }

  const trailerResult = buildXRefStreamTrailerDict(body.dictionary.entries);
  if (!trailerResult.ok) {
    if (trailerResult.error.code === "ROOT_NOT_FOUND") {
      return ok({ xref: entriesResult.value, trailer: undefined });
    }
    return trailerResult;
  }

  return ok({ xref: entriesResult.value, trailer: trailerResult.value });
}
