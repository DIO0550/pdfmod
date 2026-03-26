import { assert, expect, test } from "vitest";
import { LRUCache } from "./lru-cache";

function createCache<K, V>(capacity: number): LRUCache<K, V> {
  const result = LRUCache.create<K, V>(capacity);
  assert(result.ok, "LRUCache.create should succeed");
  return result.value;
}

test("get missはrecency順序を変更しない", () => {
  const cache = createCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);

  cache.get("missing");

  cache.set("c", 3);
  expect(cache.get("a")).toBeUndefined();
  expect(cache.get("b")).toBe(2);
  expect(cache.get("c")).toBe(3);
});

test("clearは冪等に動作する", () => {
  const cache = createCache<string, number>(3);
  cache.set("a", 1);
  cache.clear();
  expect(cache.size).toBe(0);

  cache.clear();
  expect(cache.size).toBe(0);
});
