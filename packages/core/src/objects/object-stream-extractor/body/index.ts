import type { PdfError } from "../../../errors/index";
import { ByteOffset } from "../../../types/byte-offset/index";
import type { ObjectNumber } from "../../../types/object-number/index";
import type { PdfValue } from "../../../types/pdf-types/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";
import type { LRUCache } from "../../lru-cache/index";
import { ObjectParser } from "../../object-parser/index";
import { ObjectStreamDict } from "../dict/index";
import { createFlateDecompressor } from "../flate-decompressor/index";
import { ObjectStreamHeader } from "../header/index";
import type { StreamResolver } from "../types";

/**
 * ObjStm ボディ部からオブジェクトを抽出するコンパニオンオブジェクト。
 */
export const ObjectStreamBody = {
  /**
   * オブジェクトストリーム（ObjStm）から指定オブジェクトを抽出する。
   *
   * @param resolver - ストリームオブジェクトを解決するリゾルバ
   * @param cache - 展開済みストリームのキャッシュ（undefined でキャッシュ無効）
   * @param targetObjNum - 抽出対象のオブジェクト番号
   * @param streamObjNum - ObjStm 自体のオブジェクト番号
   * @param indexInStream - ObjStm 内でのインデックス（0始まり）
   * @returns 抽出されたPDFオブジェクト、またはエラー
   */
  async extract(
    resolver: StreamResolver,
    cache: LRUCache<ObjectNumber, Uint8Array> | undefined,
    targetObjNum: ObjectNumber,
    streamObjNum: ObjectNumber,
    indexInStream: number,
  ): Promise<Result<PdfValue, PdfError>> {
    if (!Number.isSafeInteger(indexInStream) || indexInStream < 0) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: `indexInStream must be a non-negative safe integer, got ${indexInStream}`,
      });
    }

    const resolveResult = await resolver.resolve(streamObjNum);
    if (!resolveResult.ok) {
      return resolveResult;
    }

    const streamObj = resolveResult.value;
    if (streamObj.type !== "stream") {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: `Expected stream object, got ${streamObj.type}`,
      });
    }

    const dictResult = ObjectStreamDict.validate(streamObj.dictionary.entries);
    if (!dictResult.ok) {
      return dictResult;
    }

    const { first, n, needsDecompress } = dictResult.value;

    if (indexInStream >= n) {
      return err({
        code: "OBJECT_STREAM_INDEX_OUT_OF_RANGE",
        message: `indexInStream ${indexInStream} is out of range (N=${n})`,
      });
    }

    let decompressedData: Uint8Array;
    if (needsDecompress) {
      const cached = cache?.get(streamObjNum);
      if (cached !== undefined) {
        decompressedData = cached;
      } else {
        const decompressResult = await createFlateDecompressor().decompress(
          streamObj.data,
        );
        if (!decompressResult.ok) {
          return decompressResult;
        }
        decompressedData = decompressResult.value;
        cache?.set(streamObjNum, decompressedData);
      }
    } else {
      decompressedData = streamObj.data;
    }

    if (first > decompressedData.length) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: `/First (${first}) exceeds decompressed data length (${decompressedData.length})`,
      });
    }

    const needNext = indexInStream + 1 < n;
    const parseCount = indexInStream + 1 + (needNext ? 1 : 0);
    const headerResult = ObjectStreamHeader.parse(
      decompressedData,
      first,
      parseCount,
    );
    if (!headerResult.ok) {
      return headerResult;
    }

    const headers = headerResult.value;

    const targetHeader = headers[indexInStream];
    if (targetHeader.objNum !== targetObjNum) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: `ObjStm header objNum ${targetHeader.objNum as number} does not match target ${targetObjNum as number}`,
      });
    }

    const startOffset = first + (targetHeader.offset as number);
    if (startOffset > decompressedData.length) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: `Object offset ${startOffset} exceeds decompressed data length (${decompressedData.length})`,
      });
    }

    let endOffset: number;
    if (indexInStream + 1 < n && indexInStream + 1 < headers.length) {
      const nextHeader = headers[indexInStream + 1];
      if (nextHeader.offset < targetHeader.offset) {
        return err({
          code: "OBJECT_STREAM_INVALID",
          message: `ObjStm header offsets are not monotonic: next offset ${nextHeader.offset as number} < current offset ${targetHeader.offset as number}`,
        });
      }
      endOffset = first + (nextHeader.offset as number);
      if (endOffset > decompressedData.length) {
        return err({
          code: "OBJECT_STREAM_INVALID",
          message: `Next object offset ${endOffset} exceeds decompressed data length (${decompressedData.length})`,
        });
      }
    } else {
      endOffset = decompressedData.length;
    }

    if (startOffset >= endOffset) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: `Object data range is empty: startOffset=${startOffset}, endOffset=${endOffset}`,
      });
    }

    const objectData = decompressedData.subarray(startOffset, endOffset);
    const parseResult = ObjectParser.parse(objectData, ByteOffset.of(0));
    if (!parseResult.ok) {
      return parseResult;
    }

    const parsed = parseResult.value;
    if (parsed.type === "stream") {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: "ObjStm must not contain stream objects",
      });
    }

    return ok(parsed);
  },
} as const;
