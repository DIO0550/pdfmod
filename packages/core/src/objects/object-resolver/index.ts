import type { PdfError } from "../../errors/index";
import type { Result } from "../../result/index";
import { err, ok } from "../../result/index";
import { GenerationNumber } from "../../types/generation-number/index";
import type { ObjectNumber } from "../../types/object-number/index";
import type { IndirectRef, PdfObject } from "../../types/pdf-types/index";
import { LRUCache } from "../lru-cache/index";
import { ObjectParser } from "../object-parser/index";
import type { StreamResolver } from "../object-stream-extractor/index";
import { ObjectStreamBody } from "../object-stream-extractor/index";
import type {
  ObjectResolverConfig,
  ObjectResolverDeps,
  ResolveContext,
} from "./types";

const DEFAULT_CACHE_CAPACITY = 1024;
const DEFAULT_STREAM_CACHE_CAPACITY = 64;

/**
 * XRefTable を用いて IndirectRef を実体の PdfObject に解決するリゾルバ。
 * LRUCache によるメモ化、循環参照検出、XRefEntry の type 別分岐を備える。
 */
export class ObjectResolver {
  private readonly deps: ObjectResolverDeps;
  private readonly cache: LRUCache<string, PdfObject>;
  private readonly streamCache: LRUCache<ObjectNumber, Uint8Array> | undefined;
  private readonly inFlight = new Map<
    string,
    Promise<Result<PdfObject, PdfError>>
  >();

  /**
   * @param deps - 外部依存（xref, data）
   * @param cache - 解決結果キャッシュ
   * @param streamCache - ObjStm 展開済みデータキャッシュ
   */
  private constructor(
    deps: ObjectResolverDeps,
    cache: LRUCache<string, PdfObject>,
    streamCache: LRUCache<ObjectNumber, Uint8Array> | undefined,
  ) {
    this.deps = deps;
    this.cache = cache;
    this.streamCache = streamCache;
  }

  /**
   * ObjectResolver インスタンスを生成する。
   *
   * @param deps - 外部依存（xref, data）
   * @param config - キャッシュ容量等の設定（省略可）
   * @returns 成功時は Ok<ObjectResolver>、失敗時は Err<PdfError | RangeError>
   */
  static create(
    deps: ObjectResolverDeps,
    config?: ObjectResolverConfig,
  ): Result<ObjectResolver, PdfError | RangeError> {
    const cacheResult = LRUCache.create<string, PdfObject>(
      config?.cacheCapacity ?? DEFAULT_CACHE_CAPACITY,
    );
    if (!cacheResult.ok) {
      return cacheResult;
    }

    let streamCache: LRUCache<ObjectNumber, Uint8Array> | undefined;
    if (config?.streamCacheCapacity !== false) {
      const streamCacheResult = LRUCache.create<ObjectNumber, Uint8Array>(
        config?.streamCacheCapacity ?? DEFAULT_STREAM_CACHE_CAPACITY,
      );
      if (!streamCacheResult.ok) {
        return streamCacheResult;
      }
      streamCache = streamCacheResult.value;
    }

    return ok(new ObjectResolver(deps, cacheResult.value, streamCache));
  }

  /**
   * IndirectRef を実体の PdfObject に解決する。
   *
   * @param ref - 解決対象の間接参照
   * @returns 解決された PdfObject、またはエラー
   */
  async resolve(ref: IndirectRef): Promise<Result<PdfObject, PdfError>> {
    return this.resolveImpl(ref, { ancestors: new Set() });
  }

  /**
   * 型チェック付きで IndirectRef を解決する。
   *
   * @param ref - 解決対象の間接参照
   * @param expectedType - 期待する PdfObject の type
   * @returns 期待型の PdfObject、または型不一致エラー
   */
  async resolveAs<T extends PdfObject["type"]>(
    ref: IndirectRef,
    expectedType: T,
  ): Promise<Result<Extract<PdfObject, { type: T }>, PdfError>> {
    const result = await this.resolve(ref);
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
   * @param ctx - 呼び出しコンテキスト（ancestors）
   * @returns 解決された PdfObject、またはエラー
   */
  private async resolveImpl(
    ref: IndirectRef,
    ctx: ResolveContext,
  ): Promise<Result<PdfObject, PdfError>> {
    const cacheKey = `${ref.objectNumber}-${ref.generationNumber}`;

    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return ok(cached);
    }

    if (ctx.ancestors.has(cacheKey)) {
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

    ctx.ancestors.add(cacheKey);
    const promise = this.doResolve(ref, ctx, cacheKey);
    this.inFlight.set(cacheKey, promise);

    try {
      return await promise;
    } finally {
      ctx.ancestors.delete(cacheKey);
      this.inFlight.delete(cacheKey);
    }
  }

  /**
   * xref エントリの type 別分岐を行う。
   *
   * @param ref - 解決対象の間接参照
   * @param ctx - 呼び出しコンテキスト
   * @param cacheKey - キャッシュキー文字列
   * @returns 解決された PdfObject、またはエラー
   */
  private async doResolve(
    ref: IndirectRef,
    ctx: ResolveContext,
    cacheKey: string,
  ): Promise<Result<PdfObject, PdfError>> {
    const entry = this.deps.xref.entries.get(ref.objectNumber);
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
        const resolveLengthAdapter = async (
          objNum: ObjectNumber,
          genNum: GenerationNumber,
        ): Promise<Result<number, PdfError>> => {
          const lengthRef: IndirectRef = {
            objectNumber: objNum,
            generationNumber: genNum,
          };
          const r = await this.resolveImpl(lengthRef, ctx);
          if (!r.ok) {
            return r;
          }
          if (r.value.type !== "integer") {
            return err({
              code: "TYPE_MISMATCH" as const,
              message: `Expected integer for /Length, got ${r.value.type}`,
              expected: "integer",
              actual: r.value.type,
            });
          }
          return ok(r.value.value);
        };

        const parseResult = await ObjectParser.parseIndirectObject(
          this.deps.data,
          entry.offset,
          resolveLengthAdapter,
        );
        if (!parseResult.ok) {
          return parseResult;
        }
        if (
          parseResult.value.objectNumber !== ref.objectNumber ||
          parseResult.value.generationNumber !== ref.generationNumber
        ) {
          return err({
            code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
            message: `obj header mismatch: expected ${ref.objectNumber} ${ref.generationNumber}, got ${parseResult.value.objectNumber} ${parseResult.value.generationNumber}`,
            offset: entry.offset,
          });
        }
        const resolvedObj = parseResult.value.value;
        this.cache.set(cacheKey, resolvedObj);
        return ok(resolvedObj);
      }

      case 2: {
        if (ref.generationNumber !== GenerationNumber.of(0)) {
          return ok({ type: "null" });
        }
        const adapter: StreamResolver = {
          resolve: (objNum: ObjectNumber) => {
            const adapterRef: IndirectRef = {
              objectNumber: objNum,
              generationNumber: GenerationNumber.of(0),
            };
            return this.resolveImpl(adapterRef, ctx);
          },
        };

        const extractResult = await ObjectStreamBody.extract(
          adapter,
          this.streamCache,
          ref.objectNumber,
          entry.streamObject,
          entry.indexInStream,
        );

        if (extractResult.ok) {
          this.cache.set(cacheKey, extractResult.value);
        }

        return extractResult;
      }
    }
  }
}
