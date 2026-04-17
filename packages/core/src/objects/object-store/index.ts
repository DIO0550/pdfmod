import type { PdfError } from "../../errors/index";
import type { Result } from "../../utils/result/index";
import { err, ok } from "../../utils/result/index";
import { GenerationNumber } from "../../types/generation-number/index";
import type { ObjectNumber } from "../../types/object-number/index";
import type { IndirectRef, PdfObject } from "../../types/pdf-types/index";
import { LRUCache } from "../lru-cache/index";
import type { ObjectResolver } from "../object-parser/index";
import type { StreamResolver } from "../object-stream-extractor/index";
import { readInlineEntry } from "./entry-readers/inline";
import { readObjectStreamEntry } from "./entry-readers/object-stream";
import type { ObjectStoreOptions, ObjectStoreSource } from "./types";

const DEFAULT_CACHE_CAPACITY = 1024;
const DEFAULT_STREAM_CACHE_CAPACITY = 64;

/**
 * XRefTable を用いて IndirectRef を実体の PdfObject に解決するストア。
 * LRUCache によるメモ化、循環参照検出、XRefEntry の type 別分岐を備える。
 * ObjStm は常時サポート（discriminated union 不要）。
 */
export class ObjectStore {
  private readonly source: ObjectStoreSource;
  private readonly cache: LRUCache<string, PdfObject>;
  private readonly streamCache: LRUCache<ObjectNumber, Uint8Array> | undefined;
  private readonly inFlight = new Map<
    string,
    Promise<Result<PdfObject, PdfError>>
  >();

  /**
   * @param source - データソース（xref, data）
   * @param cache - 解決結果キャッシュ
   * @param streamCache - ObjStm 展開済みデータキャッシュ
   */
  private constructor(
    source: ObjectStoreSource,
    cache: LRUCache<string, PdfObject>,
    streamCache: LRUCache<ObjectNumber, Uint8Array> | undefined,
  ) {
    this.source = source;
    this.cache = cache;
    this.streamCache = streamCache;
  }

  /**
   * ObjectStore インスタンスを生成する。
   *
   * @param source - データソース（xref, data）
   * @param options - キャッシュ容量等の設定（省略可）
   * @returns 成功時は Ok<ObjectStore>、失敗時は Err<RangeError>
   */
  static create(
    source: ObjectStoreSource,
    options?: ObjectStoreOptions,
  ): Result<ObjectStore, RangeError> {
    const cacheResult = LRUCache.create<string, PdfObject>(
      options?.cacheCapacity ?? DEFAULT_CACHE_CAPACITY,
    );
    if (!cacheResult.ok) {
      return cacheResult;
    }

    let streamCache: LRUCache<ObjectNumber, Uint8Array> | undefined;
    if (options?.streamCacheCapacity !== false) {
      const streamCacheResult = LRUCache.create<ObjectNumber, Uint8Array>(
        options?.streamCacheCapacity ?? DEFAULT_STREAM_CACHE_CAPACITY,
      );
      if (!streamCacheResult.ok) {
        return streamCacheResult;
      }
      streamCache = streamCacheResult.value;
    }

    return ok(new ObjectStore(source, cacheResult.value, streamCache));
  }

  /**
   * IndirectRef を実体の PdfObject に解決する。
   *
   * @param ref - 解決対象の間接参照
   * @returns 解決された PdfObject、またはエラー
   */
  async get(ref: IndirectRef): Promise<Result<PdfObject, PdfError>> {
    return this.resolveImpl(ref, new Set());
  }

  /**
   * 型チェック付きで IndirectRef を解決する。
   *
   * @param ref - 解決対象の間接参照
   * @param expectedType - 期待する PdfObject の type
   * @returns 期待型の PdfObject、または型不一致エラー
   */
  async getAs<T extends PdfObject["type"]>(
    ref: IndirectRef,
    expectedType: T,
  ): Promise<Result<Extract<PdfObject, { type: T }>, PdfError>> {
    const result = await this.get(ref);
    if (!result.ok) {
      return result;
    }
    if (result.value.type !== expectedType) {
      return err({
        code: "TYPE_MISMATCH" as const,
        message: `Expected ${expectedType}, got ${result.value.type}`,
        expected: expectedType,
        actual: result.value.type,
      });
    }
    return ok(result.value as Extract<PdfObject, { type: T }>);
  }

  /**
   * 内部解決ロジック。循環検出・重複排除・xref type 分岐を行う。
   *
   * @param ref - 解決対象の間接参照
   * @param ancestors - 呼び出しチェーンの祖先キー（循環検出用）
   * @returns 解決された PdfObject、またはエラー
   */
  private async resolveImpl(
    ref: IndirectRef,
    ancestors: Set<string>,
  ): Promise<Result<PdfObject, PdfError>> {
    const cacheKey = `${ref.objectNumber}-${ref.generationNumber}`;

    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return ok(cached);
    }

    if (ancestors.has(cacheKey)) {
      return err({
        code: "CIRCULAR_REFERENCE" as const,
        message: `Circular reference detected for object ${ref.objectNumber} gen ${ref.generationNumber}`,
        objectId: ref,
      });
    }

    const existing = this.inFlight.get(cacheKey);
    if (existing !== undefined) {
      return existing;
    }

    ancestors.add(cacheKey);
    const promise = this.dispatch(ref, ancestors, cacheKey);
    this.inFlight.set(cacheKey, promise);

    try {
      return await promise;
    } finally {
      ancestors.delete(cacheKey);
      this.inFlight.delete(cacheKey);
    }
  }

  /**
   * xref エントリの type 別分岐を行う。
   *
   * @param ref - 解決対象の間接参照
   * @param ancestors - 呼び出しチェーンの祖先キー
   * @param cacheKey - キャッシュキー文字列
   * @returns 解決された PdfObject、またはエラー
   */
  private async dispatch(
    ref: IndirectRef,
    ancestors: Set<string>,
    cacheKey: string,
  ): Promise<Result<PdfObject, PdfError>> {
    const entry = this.source.xref.entries.get(ref.objectNumber);
    if (entry === undefined) {
      return ok({ type: "null" });
    }

    switch (entry.type) {
      case 0:
        return ok({ type: "null" });

      case 1: {
        if (entry.generationNumber !== ref.generationNumber) {
          return ok({ type: "null" });
        }
        const resolver: ObjectResolver = (
          objNum: ObjectNumber,
          genNum: GenerationNumber,
        ): Promise<Result<PdfObject, PdfError>> => {
          const lengthRef: IndirectRef = {
            objectNumber: objNum,
            generationNumber: genNum,
          };
          return this.resolveImpl(lengthRef, ancestors);
        };

        const inlineResult = await readInlineEntry(
          this.source.data,
          entry,
          ref,
          resolver,
        );

        if (inlineResult.ok) {
          this.cache.set(cacheKey, inlineResult.value);
        }

        return inlineResult;
      }

      case 2: {
        if (ref.generationNumber !== GenerationNumber.of(0)) {
          return ok({ type: "null" });
        }

        const adapter: StreamResolver = {
          /** @param objNum - 解決対象のオブジェクト番号 */
          resolve: (objNum: ObjectNumber) => {
            const adapterRef: IndirectRef = {
              objectNumber: objNum,
              generationNumber: GenerationNumber.of(0),
            };
            return this.resolveImpl(adapterRef, ancestors);
          },
        };

        const extractResult = await readObjectStreamEntry(
          adapter,
          this.streamCache,
          ref,
          entry,
        );

        if (extractResult.ok) {
          this.cache.set(cacheKey, extractResult.value);
        }

        return extractResult;
      }
    }
  }
}
