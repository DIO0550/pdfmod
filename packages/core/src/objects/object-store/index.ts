/**
 * `IndirectRef` を実体 `PdfObject` に解決する高レベル窓口。
 * `XRefTable` のエントリ type を見て inline (type=1) は `object-parser`、ObjStm (type=2) は `object-stream-extractor` に dispatch し、LRU キャッシュと循環参照検出を提供する。
 *
 * @module
 */

import type {
  PdfCircularReferenceError,
  PdfError,
  PdfWarning,
} from "../../pdf/errors/index";
import { GenerationNumber } from "../../pdf/types/generation-number/index";
import type { ObjectNumber } from "../../pdf/types/object-number/index";
import type { IndirectRef, PdfObject } from "../../pdf/types/pdf-types/index";
import type { Result } from "../../utils/result/index";
import { err, ok } from "../../utils/result/index";
import { LRUCache } from "../lru-cache/index";
import type { ObjectResolver } from "../object-parser/index";
import type { StreamResolver } from "../object-stream-extractor/index";
import { readInlineEntry } from "./entry-readers/inline";
import { readObjectStreamEntry } from "./entry-readers/object-stream";
import type { ObjectStoreOptions, ObjectStoreSource } from "./types";

const DEFAULT_CACHE_CAPACITY = 1024;
const DEFAULT_STREAM_CACHE_CAPACITY = 64;

/**
 * 解決中（in-flight）のオブジェクト 1 件分の状態。
 * `waitingOn` はこのキーを解決中のチェーンが現在 await している別キーの集合であり、
 * 全エントリを合わせるとチェーン間の待機グラフ（wait-for graph）になる。
 */
interface InFlightResolution {
  /** 解決結果の promise */
  readonly promise: Promise<Result<PdfObject, PdfError>>;
  /** このキーを解決中のチェーンが待っている in-flight キー */
  readonly waitingOn: Set<string>;
}

/**
 * 循環参照エラーを生成する。
 *
 * @param ref - 循環を検出した間接参照
 * @returns CIRCULAR_REFERENCE エラー
 */
function circularReferenceError(ref: IndirectRef): PdfCircularReferenceError {
  return {
    code: "CIRCULAR_REFERENCE",
    message: `Circular reference detected for object ${ref.objectNumber} gen ${ref.generationNumber}`,
    objectId: ref,
  };
}

/**
 * XRefTable を用いて IndirectRef を実体の PdfObject に解決するストア。
 * LRUCache によるメモ化、循環参照検出、XRefEntry の type 別分岐を備える。
 * ObjStm は常時サポート（discriminated union 不要）。
 */
export class ObjectStore {
  private readonly source: ObjectStoreSource;
  private readonly cache: LRUCache<string, PdfObject>;
  private readonly streamCache: LRUCache<ObjectNumber, Uint8Array> | undefined;
  private readonly onWarning: ((warning: PdfWarning) => void) | undefined;
  private readonly inFlight = new Map<string, InFlightResolution>();

  /**
   * @param source - データソース（xref, data）
   * @param cache - 解決結果キャッシュ
   * @param streamCache - ObjStm 展開済みデータキャッシュ
   * @param onWarning - 回復可能な警告を受け取るコールバック
   */
  private constructor(
    source: ObjectStoreSource,
    cache: LRUCache<string, PdfObject>,
    streamCache: LRUCache<ObjectNumber, Uint8Array> | undefined,
    onWarning: undefined | ((warning: PdfWarning) => void),
  ) {
    this.source = source;
    this.cache = cache;
    this.streamCache = streamCache;
    this.onWarning = onWarning;
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

    return ok(
      new ObjectStore(
        source,
        cacheResult.value,
        streamCache,
        options?.onWarning,
      ),
    );
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
      return err(circularReferenceError(ref));
    }

    const existing = this.inFlight.get(cacheKey);
    if (existing !== undefined) {
      return this.awaitInFlight(existing, cacheKey, ref, ancestors);
    }

    ancestors.add(cacheKey);
    // dispatch() は最初の await まで同期実行される。その区間から別キーの待機に入ると
    // 自分のキーがまだ待機グラフに無く辺が張られないため、登録を先に完了させる
    const promise = Promise.resolve().then(() =>
      this.dispatch(ref, ancestors, cacheKey),
    );
    this.inFlight.set(cacheKey, { promise, waitingOn: new Set() });

    try {
      return await promise;
    } finally {
      ancestors.delete(cacheKey);
      this.inFlight.delete(cacheKey);
    }
  }

  /**
   * 他チェーンが解決中のオブジェクトの完了を待つ。
   * 待つと待機グラフに閉路ができる場合は待たずに循環参照エラーを返す。
   *
   * @param entry - 待機対象の in-flight エントリ
   * @param cacheKey - 待機対象のキャッシュキー
   * @param ref - 待機対象の間接参照（エラー生成に使う）
   * @param ancestors - 呼び出しチェーンが解決中のキー集合
   * @returns 解決された PdfObject、または CIRCULAR_REFERENCE エラー
   */
  private async awaitInFlight(
    entry: InFlightResolution,
    cacheKey: string,
    ref: IndirectRef,
    ancestors: ReadonlySet<string>,
  ): Promise<Result<PdfObject, PdfError>> {
    if (this.hasWaitPathTo(cacheKey, ancestors)) {
      return err(circularReferenceError(ref));
    }

    // 入れ子の解決では外側のキーも内側の完了待ちで塞がるため、解決中の全キーから辺を張る
    for (const ownedKey of ancestors) {
      this.inFlight.get(ownedKey)?.waitingOn.add(cacheKey);
    }

    try {
      return await entry.promise;
    } finally {
      for (const ownedKey of ancestors) {
        this.inFlight.get(ownedKey)?.waitingOn.delete(cacheKey);
      }
    }
  }

  /**
   * 待機グラフを start から辿り、呼び出しチェーンが解決中のキーに到達するか判定する。
   *
   * @param start - これから待とうとしている in-flight キー
   * @param ancestors - 呼び出しチェーンが解決中のキー集合
   * @returns 到達する（＝待つと閉路になる）場合 true
   */
  private hasWaitPathTo(
    start: string,
    ancestors: ReadonlySet<string>,
  ): boolean {
    const stack: string[] = [start];
    const visited = new Set<string>();

    while (stack.length > 0) {
      const key = stack.pop();
      if (key === undefined || visited.has(key)) {
        continue;
      }
      visited.add(key);

      const entry = this.inFlight.get(key);
      if (entry === undefined) {
        continue;
      }

      for (const next of entry.waitingOn) {
        if (ancestors.has(next)) {
          return true;
        }
        stack.push(next);
      }
    }

    return false;
  }

  /**
   * xref エントリの type 別分岐を行う。
   *
   * ISO 32000-1 §7.3.10 により、未定義オブジェクト・フリーエントリ・世代番号不一致の
   * 間接参照はエラーではなく null オブジェクトとして解決する。
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
      // ISO 32000-1 §7.3.10: 未定義オブジェクトへの間接参照は null オブジェクトとして解決する
      return ok({ type: "null" });
    }

    switch (entry.type) {
      case 0:
        // ISO 32000-1 §7.3.10: フリーエントリ（type 0）への参照は未定義オブジェクトと同様に
        // null オブジェクトとして解決する
        return ok({ type: "null" });

      case 1: {
        if (entry.generationNumber !== ref.generationNumber) {
          // ISO 32000-1 §7.3.10: 世代番号が一致しない参照は未定義オブジェクトとみなし
          // null オブジェクトとして解決する
          this.onWarning?.({
            code: "GENERATION_MISMATCH",
            message: `Object ${ref.objectNumber}: generation mismatch (expected ${entry.generationNumber}, got ${ref.generationNumber})`,
            offset: entry.offset,
          });
          // 警告の重複発火防止: mismatch 結果は他の成功パス（inline/ObjStm 読み取り）と
          // 異なりキャッシュされないため、cache.set しないと再 get() のたびに
          // dispatch() が再実行され警告も再発火してしまう
          this.cache.set(cacheKey, { type: "null" });
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
          // ISO 32000-1 §7.3.10: ObjStm 内オブジェクトの世代番号は常に 0 のため、
          // 0 以外を指定する参照は未定義オブジェクトとみなし null オブジェクトとして解決する
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
