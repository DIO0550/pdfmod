import type { Result } from "../result/index.js";
import { err, ok } from "../result/index.js";

/** LRU (Least Recently Used) cache with O(1) get/set operations */
export class LRUCache<K, V> {
  private readonly map = new Map<K, V>();
  private readonly capacity: number;

  private constructor(capacity: number) {
    this.capacity = capacity;
  }

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

  get(key: K): V | undefined {
    if (!this.map.has(key)) {
      return undefined;
    }
    const value = this.map.get(key) as V;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.capacity) {
      const oldest = this.map.keys().next().value as K;
      this.map.delete(oldest);
    }
    this.map.set(key, value);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }
  delete(key: K): boolean {
    return this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  get size(): number {
    return this.map.size;
  }
}
