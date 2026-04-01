import type { PdfError, PdfParseError } from "../../errors/index";
import type { Result } from "../../result/index";
import { err, ok } from "../../result/index";
import type { ObjectNumber } from "../../types/object-number/index";
import type { PdfObject } from "../../types/pdf-types/index";
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

/** ヘッダパース結果の1エントリ */
export interface HeaderEntry {
  readonly objNum: number;
  readonly offset: number;
}

/**
 * ObjStm のオフセットテーブルをパースする。
 * 展開済みデータの先頭 first バイトから N 組の (objNum, offset) ペアを読み取る。
 */
export function parseHeader(
  data: Uint8Array,
  first: number,
  n: number,
): Result<readonly HeaderEntry[], PdfParseError> {
  if (first < 0 || first > data.length) {
    return err({
      code: "OBJECT_STREAM_HEADER_INVALID",
      message: `ObjStm header range is invalid: first=${first}, length=${data.length}`,
    });
  }

  if (n === 0) {
    return ok([]);
  }

  const headerBytes = data.subarray(0, first);
  const headerText = new TextDecoder().decode(headerBytes);
  const tokens = headerText.trim().split(/\s+/);

  if (tokens.length === 1 && tokens[0] === "") {
    return err({
      code: "OBJECT_STREAM_HEADER_INVALID",
      message: "ObjStm header is empty",
    });
  }

  if (tokens.length % 2 !== 0) {
    return err({
      code: "OBJECT_STREAM_HEADER_INVALID",
      message: `ObjStm header has odd number of tokens: ${tokens.length}`,
    });
  }

  const DECIMAL_INTEGER = /^[0-9]+$/;

  const entries: HeaderEntry[] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    if (!DECIMAL_INTEGER.test(tokens[i])) {
      return err({
        code: "OBJECT_STREAM_HEADER_INVALID",
        message: `Invalid objNum in ObjStm header: "${tokens[i]}"`,
      });
    }
    if (!DECIMAL_INTEGER.test(tokens[i + 1])) {
      return err({
        code: "OBJECT_STREAM_HEADER_INVALID",
        message: `Invalid offset in ObjStm header: "${tokens[i + 1]}"`,
      });
    }

    const objNum = Number(tokens[i]);
    const offset = Number(tokens[i + 1]);

    if (!Number.isSafeInteger(objNum)) {
      return err({
        code: "OBJECT_STREAM_HEADER_INVALID",
        message: `Invalid objNum in ObjStm header: "${tokens[i]}"`,
      });
    }
    if (!Number.isSafeInteger(offset)) {
      return err({
        code: "OBJECT_STREAM_HEADER_INVALID",
        message: `Invalid offset in ObjStm header: "${tokens[i + 1]}"`,
      });
    }

    entries.push({ objNum, offset });
  }

  if (entries.length !== n) {
    return err({
      code: "OBJECT_STREAM_HEADER_INVALID",
      message: `ObjStm header has ${entries.length} pairs, expected ${n}`,
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
  const typeEntry = entries.get("Type");
  if (typeEntry === undefined || typeEntry.type !== "name") {
    return err({
      code: "OBJECT_STREAM_INVALID",
      message: "ObjStm dictionary missing /Type or /Type is not a name",
    });
  }
  if (typeEntry.value !== "ObjStm") {
    return err({
      code: "OBJECT_STREAM_INVALID",
      message: `ObjStm /Type must be /ObjStm, got /${typeEntry.value}`,
    });
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
  if (!Number.isSafeInteger(firstEntry.value) || firstEntry.value < 0) {
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
  if (!Number.isSafeInteger(nEntry.value) || nEntry.value < 0) {
    return err({
      code: "OBJECT_STREAM_INVALID",
      message: `ObjStm /N must be a non-negative safe integer, got ${nEntry.value}`,
    });
  }

  const decodeParmsEntry = entries.get("DecodeParms");
  if (decodeParmsEntry !== undefined) {
    return err({
      code: "OBJECT_STREAM_INVALID",
      message: "ObjStm with /DecodeParms is not supported in current scope",
    });
  }

  const filterEntry = entries.get("Filter");
  if (filterEntry === undefined) {
    return ok({
      first: firstEntry.value,
      n: nEntry.value,
      needsDecompress: false,
    });
  }
  if (filterEntry.type === "array") {
    return err({
      code: "OBJECT_STREAM_INVALID",
      message: "ObjStm /Filter as array (multi-stage filter) is not supported",
    });
  }
  if (filterEntry.type !== "name") {
    return err({
      code: "OBJECT_STREAM_INVALID",
      message: "ObjStm /Filter must be a name",
    });
  }
  if (filterEntry.value !== "FlateDecode") {
    return err({
      code: "OBJECT_STREAM_INVALID",
      message: `ObjStm /Filter /${filterEntry.value} is not supported`,
    });
  }

  return ok({
    first: firstEntry.value,
    n: nEntry.value,
    needsDecompress: true,
  });
}

const DEFAULT_CACHE_CAPACITY = 64;

/**
 * オブジェクトストリーム内のオブジェクトを抽出するクラス。
 */
export class ObjectStreamExtractor {
  private readonly resolver: StreamResolver;
  private readonly parser: StreamObjectParser;
  private readonly decompressor: StreamDecompressor;
  private readonly cache: LRUCache<ObjectNumber, Uint8Array>;

  private constructor(
    deps: ObjectStreamExtractorDeps,
    cache: LRUCache<ObjectNumber, Uint8Array>,
  ) {
    this.resolver = deps.resolver;
    this.parser = deps.parser;
    this.decompressor = deps.decompressor;
    this.cache = cache;
  }

  static create(
    deps: ObjectStreamExtractorDeps,
    cacheCapacity: number = DEFAULT_CACHE_CAPACITY,
  ): Result<ObjectStreamExtractor, RangeError> {
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
    const cached = this.cache.get(streamObjNum);
    if (cached !== undefined) {
      decompressedData = cached;
    } else if (needsDecompress) {
      const decompressResult = await this.decompressor.decompress(
        streamObj.data,
      );
      if (!decompressResult.ok) {
        return decompressResult;
      }
      decompressedData = decompressResult.value;
      this.cache.set(streamObjNum, decompressedData);
    } else {
      decompressedData = streamObj.data;
      this.cache.set(streamObjNum, decompressedData);
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
    if (targetHeader.objNum !== (targetObjNum as number)) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: `ObjStm header objNum ${targetHeader.objNum} does not match target ${targetObjNum as number}`,
      });
    }

    const startOffset = first + targetHeader.offset;
    if (startOffset > decompressedData.length) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: `Object offset ${startOffset} exceeds decompressed data length (${decompressedData.length})`,
      });
    }

    const endOffset =
      indexInStream + 1 < headers.length
        ? first + headers[indexInStream + 1].offset
        : decompressedData.length;

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
