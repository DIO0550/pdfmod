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

import type { ObjectResolver } from "../../../objects/object-parser/index";
import { ObjectParser } from "../../../objects/object-parser/index";
import type { PdfError, PdfWarning } from "../../../pdf/errors/index";
import type { ByteOffset } from "../../../pdf/types/byte-offset/index";
import type {
  GenerationNumber,
  ObjectNumber,
  TrailerDict,
  XRefTable,
} from "../../../pdf/types/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";
import { XRefStreamDict } from "../dict/index";
import { decompressFlate } from "../flatedecode/index";
import { decodeXRefStreamEntries } from "../parser/index";
import { Predictor } from "../predictor/index";
import { buildXRefStreamTrailerDict } from "../trailer/index";
import { createBootstrapLengthResolver } from "./bootstrap-length-resolver/index";

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
 * `/Length` が間接参照の場合、xref テーブル構築前のブートストラップ resolver
 * （`createBootstrapLengthResolver`、`scanObjectHeaders` によるバイト走査ベース）で解決する。
 * 解決に成功した場合、xref ストリーム全体のパースが最終的に成功した時点で
 * `onWarning` 経由で `XREF_STREAM_LENGTH_BOOTSTRAP` を通知する。
 *
 * @param data - PDF ファイル全体のバイト配列
 * @param offset - xref ストリームを定義する間接オブジェクトの開始バイトオフセット
 * @param onWarning - 間接 `/Length` をブートストラップ解決した場合に通知するコールバック（省略可）
 * @returns 成功時は `Ok<{ xref, trailer }>`（`trailer` は `/Root` 欠如時 `undefined`）、
 *   失敗時は `Err<PdfError>`
 */
export async function parseXRefStream(
  data: Uint8Array,
  offset: ByteOffset,
  onWarning?: (warning: PdfWarning) => void,
): Promise<
  Result<{ xref: XRefTable; trailer: TrailerDict | undefined }, PdfError>
> {
  const bootstrapResolver = createBootstrapLengthResolver(data);
  let bootstrapInfo:
    | { objectNumber: ObjectNumber; generationNumber: GenerationNumber }
    | undefined;
  // ObjectParser.parseIndirectObject は resolver を stream の /Length が間接参照の
  // 場合にのみ呼び出す（objects/object-parser/types.ts の ObjectResolver コメント参照）。
  // そのためこの resolver が呼ばれ成功した = 間接 /Length をブートストラップ解決した、
  // という前提で bootstrapInfo を設定してよい。
  const resolver: ObjectResolver = async (objectNumber, generationNumber) => {
    const result = await bootstrapResolver(objectNumber, generationNumber);
    if (result.ok) {
      bootstrapInfo = { objectNumber, generationNumber };
    }
    return result;
  };

  /**
   * xref ストリーム全体のパースが最終的に成功した場合にのみ呼ぶ。
   * `bootstrapInfo` は resolver 呼び出し時点（間接 `/Length` の解決成功時点）で
   * 設定されるが、その後 dict/decode/entries/trailer のいずれかが失敗した場合は
   * この関数を呼ばないことで、実際には使われなかった中間結果の warning が
   * 利用者へ漏れることを防ぐ。
   */
  const emitBootstrapWarningIfUsed = (): void => {
    if (bootstrapInfo === undefined) {
      return;
    }
    onWarning?.({
      code: "XREF_STREAM_LENGTH_BOOTSTRAP",
      message: `xref stream /Length resolved via bootstrap object header scan (object ${bootstrapInfo.objectNumber} ${bootstrapInfo.generationNumber})`,
      offset,
    });
  };

  const objectResult = await ObjectParser.parseIndirectObject(
    data,
    offset,
    resolver,
  );
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
      emitBootstrapWarningIfUsed();
      return ok({ xref: entriesResult.value, trailer: undefined });
    }
    return trailerResult;
  }

  emitBootstrapWarningIfUsed();
  return ok({ xref: entriesResult.value, trailer: trailerResult.value });
}
