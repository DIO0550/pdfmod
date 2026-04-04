import type { PdfError } from "../../../errors/index";
import type { Result } from "../../../result/index";
import { err, ok } from "../../../result/index";
import type { ObjectNumber } from "../../../types/object-number/index";
import type { PdfObject } from "../../../types/pdf-types/index";
import { LRUCache } from "../../lru-cache/index";
import { ObjectStreamDict } from "../dict/index";
import { ObjectStreamHeader } from "../header/index";
import type {
  ObjectStreamExtractorDeps,
  StreamDecompressor,
  StreamObjectParser,
  StreamResolver,
} from "../types";

const DEFAULT_CACHE_CAPACITY = 8;

/**
 * オブジェクトストリーム内のオブジェクトを抽出するクラス。
 */
export class ObjectStreamExtractor {
  private readonly resolver: StreamResolver;
  private readonly parser: StreamObjectParser;
  private readonly decompressor: StreamDecompressor;
  private readonly cache: LRUCache<ObjectNumber, Uint8Array> | undefined;

  private constructor(
    deps: ObjectStreamExtractorDeps,
    cache: LRUCache<ObjectNumber, Uint8Array> | undefined,
  ) {
    this.resolver = deps.resolver;
    this.parser = deps.parser;
    this.decompressor = deps.decompressor;
    this.cache = cache;
  }

  /**
   * ObjectStreamExtractor を生成する。
   *
   * @param deps - 依存オブジェクト
   * @param cacheCapacity - 展開済みストリームのキャッシュ容量。0 でキャッシュ無効化。
   * @returns ObjectStreamExtractor インスタンス、またはエラー
   */
  static create(
    deps: ObjectStreamExtractorDeps,
    cacheCapacity: number = DEFAULT_CACHE_CAPACITY,
  ): Result<ObjectStreamExtractor, RangeError> {
    if (cacheCapacity === 0) {
      return ok(new ObjectStreamExtractor(deps, undefined));
    }
    const cacheResult = LRUCache.create<ObjectNumber, Uint8Array>(
      cacheCapacity,
    );
    if (!cacheResult.ok) {
      return err(cacheResult.error);
    }
    return ok(new ObjectStreamExtractor(deps, cacheResult.value));
  }

  /**
   * オブジェクトストリーム（ObjStm）から指定オブジェクトを抽出する。
   *
   * @param targetObjNum - 抽出対象のオブジェクト番号
   * @param streamObjNum - ObjStm 自体のオブジェクト番号
   * @param indexInStream - ObjStm 内でのインデックス（0始まり）
   * @returns 抽出されたPDFオブジェクト、またはエラー
   */
  async extract(
    targetObjNum: ObjectNumber,
    streamObjNum: ObjectNumber,
    indexInStream: number,
  ): Promise<Result<PdfObject, PdfError>> {
    if (!Number.isSafeInteger(indexInStream) || indexInStream < 0) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: `indexInStream must be a non-negative safe integer, got ${indexInStream}`,
      });
    }

    const resolveResult = await this.resolver.resolve(streamObjNum);
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
      const cached = this.cache?.get(streamObjNum);
      if (cached !== undefined) {
        decompressedData = cached;
      } else {
        const decompressResult = await this.decompressor.decompress(
          streamObj.data,
        );
        if (!decompressResult.ok) {
          return decompressResult;
        }
        decompressedData = decompressResult.value;
        this.cache?.set(streamObjNum, decompressedData);
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
    const parseResult = this.parser.parse(objectData, 0);
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
  }
}
