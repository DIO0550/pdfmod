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

import { isPdfTokenBoundary } from "../../../lexer/bytes/index";
import { ObjectParser } from "../../../objects/object-parser/index";
import type { PdfError } from "../../../pdf/errors/index";
import { ByteOffset } from "../../../pdf/types/byte-offset/index";
import type { GenerationNumber } from "../../../pdf/types/generation-number/index";
import type { TrailerDict, XRefTable } from "../../../pdf/types/index";
import type { ObjectNumber } from "../../../pdf/types/object-number/index";
import type { PdfObject } from "../../../pdf/types/pdf-types/index";
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
  /** @param objNum - オブジェクト番号 @param genNum - 世代番号 @returns 解決結果 */
  const resolver = (
    objNum: ObjectNumber,
    genNum: GenerationNumber,
  ): Promise<Result<PdfObject, PdfError>> =>
    resolveLocalLength(data, objNum, genNum);
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
      return ok({ xref: entriesResult.value, trailer: undefined });
    }
    return trailerResult;
  }

  return ok({ xref: entriesResult.value, trailer: trailerResult.value });
}

/**
 * バイト列全体を走査して指定オブジェクトを発見・パースし、body を返す。
 * xref テーブル未構築段階で間接参照 `/Length` を解決するために使用する。
 *
 * @param data - PDF ファイル全体のバイト配列
 * @param objectNumber - 解決対象のオブジェクト番号
 * @param generationNumber - 解決対象の世代番号
 * @returns 成功時は参照先オブジェクトの body、失敗時は `OBJECT_PARSE_STREAM_LENGTH` エラー
 */
export async function resolveLocalLength(
  data: Uint8Array,
  objectNumber: ObjectNumber,
  generationNumber: GenerationNumber,
): Promise<Result<PdfObject, PdfError>> {
  const offsets = scanForObjectOffsets(
    data,
    objectNumber as number,
    generationNumber as number,
  );

  if (offsets.length === 0) {
    return err({
      code: "OBJECT_PARSE_STREAM_LENGTH",
      message: `Cannot locate object ${String(objectNumber)} ${String(generationNumber)} in data for /Length resolution`,
      offset: ByteOffset.of(0),
    });
  }

  let lastError: PdfError | undefined;
  for (let i = offsets.length - 1; i >= 0; i--) {
    const parseResult = await ObjectParser.parseIndirectObject(
      data,
      offsets[i] as ByteOffset,
    );
    if (parseResult.ok) {
      return ok(parseResult.value.body);
    }
    lastError = parseResult.error;
  }

  return err({
    code: "OBJECT_PARSE_STREAM_LENGTH",
    message: `/Length reference target object parse failed: ${lastError?.message ?? "unknown"}`,
    offset: offsets[0] ?? ByteOffset.of(0),
  });
}

/**
 * バイト列を走査して `{objNum} {genNum} obj` パターンに一致するオフセットを全て返す。
 *
 * @param data - PDF ファイル全体のバイト配列
 * @param objNum - 検索対象のオブジェクト番号
 * @param genNum - 検索対象の世代番号
 * @returns 一致した各候補のバイトオフセット配列（出現順）
 */
export function scanForObjectOffsets(
  data: Uint8Array,
  objNum: number,
  genNum: number,
): ByteOffset[] {
  const pattern = new TextEncoder().encode(
    `${String(objNum)} ${String(genNum)} obj`,
  );
  const results: ByteOffset[] = [];

  for (let i = 0; i <= data.length - pattern.length; i++) {
    const prevByte = data[i - 1];
    if (i > 0 && prevByte !== undefined && !isPdfTokenBoundary(prevByte)) {
      continue;
    }

    let matched = true;
    for (let j = 0; j < pattern.length; j++) {
      if (data[i + j] !== pattern[j]) {
        matched = false;
        break;
      }
    }

    if (!matched) {
      continue;
    }

    const afterPattern = i + pattern.length;
    const afterByte = data[afterPattern];
    if (
      afterPattern < data.length &&
      afterByte !== undefined &&
      !isPdfTokenBoundary(afterByte)
    ) {
      continue;
    }

    results.push(ByteOffset.of(i));
  }

  return results;
}
