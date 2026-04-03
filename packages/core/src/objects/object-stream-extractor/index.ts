import type { PdfError, PdfParseError } from "../../errors/index";
import { Tokenizer } from "../../lexer/index";
import { NumberEx } from "../../number-ex/index";
import { PdfFilter } from "../../pdf-filter/index";
import { PdfType } from "../../pdf-type/index";
import type { Result } from "../../result/index";
import { err, ok } from "../../result/index";
import { ByteOffset } from "../../types/byte-offset/index";
import { ObjectNumber } from "../../types/object-number/index";
import type { PdfObject } from "../../types/pdf-types/index";
import { TokenType } from "../../types/pdf-types/index";
import { decompressFlate } from "../../xref/stream/flatedecode/index";
import { LRUCache } from "../lru-cache/index";

/**
 * ストリームオブジェクトを解決するインタフェース。
 * ObjectResolver が実装される際に具象クラスを注入する。
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
 * ObjectStreamExtractor の依存を束ねる型。
 */
export interface ObjectStreamExtractorDeps {
  readonly resolver: StreamResolver;
  readonly parser: StreamObjectParser;
  readonly decompressor: StreamDecompressor;
}

/**
 * FlateDecode アダプタ。
 * decompressFlate をラップして StreamDecompressor インタフェースに適合させる。
 *
 * @returns StreamDecompressor インタフェースの FlateDecode 実装
 */
export const createFlateDecompressor = (): StreamDecompressor => ({
  decompress: (data: Uint8Array) => decompressFlate(data),
});

/** ObjStm ヘッダの1ペア（オブジェクト番号とオフセット） */
export interface ObjectStreamHeader {
  readonly objNum: ObjectNumber;
  readonly offset: ByteOffset;
}

/**
 * ObjStm のオフセットテーブルをパースする。
 * 展開済みデータの先頭 first バイトから N 組の (objNum, offset) ペアを
 * Tokenizer（ISO 32000-1 準拠の字句解析器）で読み取る。
 */
export function parseHeader(
  data: Uint8Array,
  first: number,
  n: number,
): Result<readonly ObjectStreamHeader[], PdfParseError> {
  if (first < 0 || first > data.length) {
    return err({
      code: "OBJECT_STREAM_HEADER_INVALID",
      message: `ObjStm header range is invalid: first=${first}, length=${data.length}`,
    });
  }

  if (n === 0) {
    return ok([]);
  }

  const headerData = data.subarray(0, first);
  const tokenizer = new Tokenizer(headerData);
  const entries: ObjectStreamHeader[] = [];

  for (let i = 0; i < n; i++) {
    const objNumToken = tokenizer.nextToken();
    if (objNumToken.type !== TokenType.Integer) {
      return err({
        code: "OBJECT_STREAM_HEADER_INVALID",
        message: `Expected integer objNum at pair ${i}, got ${objNumToken.type}`,
      });
    }
    const objNumValue = objNumToken.value as number;
    if (!NumberEx.isSafeIntegerAtLeastZero(objNumValue)) {
      return err({
        code: "OBJECT_STREAM_HEADER_INVALID",
        message: `Invalid objNum in ObjStm header: ${objNumValue}`,
      });
    }

    const offsetToken = tokenizer.nextToken();
    if (offsetToken.type !== TokenType.Integer) {
      return err({
        code: "OBJECT_STREAM_HEADER_INVALID",
        message: `Expected integer offset at pair ${i}, got ${offsetToken.type}`,
      });
    }
    const offsetValue = offsetToken.value as number;
    if (!NumberEx.isSafeIntegerAtLeastZero(offsetValue)) {
      return err({
        code: "OBJECT_STREAM_HEADER_INVALID",
        message: `Invalid offset in ObjStm header: ${offsetValue}`,
      });
    }

    entries.push({
      objNum: ObjectNumber.of(objNumValue),
      offset: ByteOffset.of(offsetValue),
    });
  }

  return ok(entries);
}

/** 辞書バリデーション成功時の結果 */
export interface ValidatedStreamDict {
  readonly first: number;
  readonly n: number;
  readonly needsDecompress: boolean;
}

/**
 * ObjStm ストリーム辞書をバリデーションする。
 * /Type, /N, /First, /Filter, /DecodeParms を検証する。
 */
export function validateStreamDict(
  entries: Map<string, PdfObject>,
): Result<ValidatedStreamDict, PdfParseError> {
  const typeResult = PdfType.validate(entries, "ObjStm");
  if (!typeResult.ok) {
    return typeResult;
  }

  const firstEntry = entries.get("First");
  if (firstEntry === undefined) {
    return err({
      code: "OBJECT_STREAM_INVALID",
      message: "ObjStm dictionary missing /First",
    });
  }
  if (firstEntry.type !== "integer") {
    return err({
      code: "OBJECT_STREAM_INVALID",
      message: "ObjStm /First must be an integer",
    });
  }
  if (!NumberEx.isSafeIntegerAtLeastZero(firstEntry.value)) {
    return err({
      code: "OBJECT_STREAM_INVALID",
      message: `ObjStm /First must be a non-negative safe integer, got ${firstEntry.value}`,
    });
  }

  const nEntry = entries.get("N");
  if (nEntry === undefined) {
    return err({
      code: "OBJECT_STREAM_INVALID",
      message: "ObjStm dictionary missing /N",
    });
  }
  if (nEntry.type !== "integer") {
    return err({
      code: "OBJECT_STREAM_INVALID",
      message: "ObjStm /N must be an integer",
    });
  }
  if (!NumberEx.isSafeIntegerAtLeastZero(nEntry.value)) {
    return err({
      code: "OBJECT_STREAM_INVALID",
      message: `ObjStm /N must be a non-negative safe integer, got ${nEntry.value}`,
    });
  }

  const extendsEntry = entries.get("Extends");
  if (extendsEntry !== undefined) {
    return err({
      code: "OBJECT_STREAM_INVALID",
      message: "ObjStm with /Extends is not supported in current scope",
    });
  }

  const decodeParmsEntry = entries.get("DecodeParms");
  if (decodeParmsEntry !== undefined) {
    return err({
      code: "OBJECT_STREAM_INVALID",
      message: "ObjStm with /DecodeParms is not supported in current scope",
    });
  }

  const filterResult = PdfFilter.validate(entries);
  if (!filterResult.ok) {
    return filterResult;
  }

  return ok({
    first: firstEntry.value,
    n: nEntry.value,
    needsDecompress: filterResult.value !== undefined,
  });
}

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
   * @param cacheCapacity - 展開済みストリームのキャッシュ容量。0 でキャッシュ無効化。
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

    const dictResult = validateStreamDict(streamObj.dictionary.entries);
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

    const headerResult = parseHeader(decompressedData, first, n);
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
    if (indexInStream + 1 < headers.length) {
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
