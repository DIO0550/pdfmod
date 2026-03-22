import type { Result } from "../result/index.js";
import { err, ok } from "../result/index.js";

/**
 * 固定容量のLeast Recently Usedキャッシュ。
 * 容量超過時は最も古いエントリを自動的に削除する。
 * get/set操作はO(1)で動作する。
 *
 * @typeParam K - キャッシュキーの型
 * @typeParam V - キャッシュ値の型
 *
 * @example
 * ```ts
 * const result = LRUCache.create<string, number>(3);
 * if (result.ok) {
 *   const cache = result.value;
 *   cache.set("a", 1);
 *   cache.get("a"); // 1
 * }
 * ```
 */
export class LRUCache<K, V> {
  private readonly map = new Map<K, V>();
  private readonly capacity: number;

  /**
   * LRUCacheを初期化する（privateコンストラクタ）。
   * インスタンス生成には {@link LRUCache.create} を使用する。
   *
   * @param capacity - キャッシュの最大容量
   *
   * @example
   * ```ts
   * // privateコンストラクタ: LRUCache.create() を使用してください
   * ```
   */
  private constructor(capacity: number) {
    this.capacity = capacity;
  }

  /**
   * LRUCacheインスタンスを生成する。
   * 容量が正の整数でない場合は `Err<RangeError>` を返す。
   *
   * @typeParam K - キャッシュキーの型
   * @typeParam V - キャッシュ値の型
   * @param capacity - キャッシュの最大容量（デフォルト: 1024）
   * @returns 成功時は `Ok<LRUCache<K, V>>`、失敗時は `Err<RangeError>`
   *
   * @example
   * ```ts
   * const result = LRUCache.create<string, number>(100);
   * if (result.ok) {
   *   const cache = result.value;
   * }
   * ```
   */
  static create<K, V>(
    capacity: number = 1024,
  ): Result<LRUCache<K, V>, RangeError> {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      return err(
        new RangeError(
          `LRUCache capacity must be a positive integer, got ${capacity}`,
        ),
      );
    }
    return ok(new LRUCache<K, V>(capacity));
  }

  /**
   * キーに対応する値を取得する。
   * アクセスされたエントリは最新として更新される。
   *
   * @param key - 検索するキー
   * @returns 値が存在する場合はその値、存在しない場合は `undefined`
   *
   * @example
   * ```ts
   * cache.set("key", 42);
   * cache.get("key");     // 42
   * cache.get("missing"); // undefined
   * ```
   */
  get(key: K): V | undefined {
    if (!this.map.has(key)) {
      return undefined;
    }
    const value = this.map.get(key) as V;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  /**
   * キーと値のペアをキャッシュに追加する。
   * 既存キーの場合は値を更新し最新として配置する。
   * 容量超過時は最も古いエントリを削除する。
   *
   * @param key - キャッシュキー
   * @param value - キャッシュ値
   *
   * @example
   * ```ts
   * cache.set("key", 42);
   * ```
   */
  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.capacity) {
      const oldest = this.map.keys().next().value as K;
      this.map.delete(oldest);
    }
    this.map.set(key, value);
  }

  /**
   * 指定キーがキャッシュに存在するかを判定する。
   *
   * @param key - 検索するキー
   * @returns キーが存在する場合は `true`
   *
   * @example
   * ```ts
   * cache.set("key", 42);
   * cache.has("key");     // true
   * cache.has("missing"); // false
   * ```
   */
  has(key: K): boolean {
    return this.map.has(key);
  }

  /**
   * 指定キーのエントリをキャッシュから削除する。
   *
   * @param key - 削除するキー
   * @returns エントリが存在し削除された場合は `true`
   *
   * @example
   * ```ts
   * cache.set("key", 42);
   * cache.delete("key"); // true
   * cache.delete("key"); // false
   * ```
   */
  delete(key: K): boolean {
    return this.map.delete(key);
  }

  /**
   * キャッシュの全エントリを削除する。
   *
   * @example
   * ```ts
   * cache.clear();
   * cache.size; // 0
   * ```
   */
  clear(): void {
    this.map.clear();
  }

  /**
   * キャッシュ内のエントリ数。
   *
   * @returns 現在のエントリ数
   *
   * @example
   * ```ts
   * cache.set("a", 1);
   * cache.size; // 1
   * ```
   */
  get size(): number {
    return this.map.size;
  }
}
