import { expect, test } from "vitest";
import { LRUCache } from "./lru-cache.js";

function createCache<K, V>(capacity?: number): LRUCache<K, V> {
  const result =
    capacity === undefined
      ? LRUCache.create<K, V>()
      : LRUCache.create<K, V>(capacity);
  if (!result.ok) {
    throw new Error(`Unexpected create failure: ${result.error.message}`);
  }
  return result.value;
}

test("setした値をgetで取得できる", () => {
  const cache = createCache<string, number>();
  cache.set("a", 1);
  expect(cache.get("a")).toBe(1);
});

test("存在しないキーのgetでundefinedを返す", () => {
  const cache = createCache<string, number>();
  expect(cache.get("missing")).toBeUndefined();
});

test("sizeが現在のエントリ数を返す", () => {
  const cache = createCache<string, number>();
  expect(cache.size).toBe(0);
  cache.set("a", 1);
  expect(cache.size).toBe(1);
  cache.set("b", 2);
  expect(cache.size).toBe(2);
});

test("hasでキーの存在を確認できる", () => {
  const cache = createCache<string, number>();
  expect(cache.has("a")).toBe(false);
  cache.set("a", 1);
  expect(cache.has("a")).toBe(true);
});

test("同一キーへのsetで値が上書きされる", () => {
  const cache = createCache<string, number>();
  cache.set("a", 1);
  cache.set("a", 2);
  expect(cache.get("a")).toBe(2);
  expect(cache.size).toBe(1);
});

test("存在するキーのdeleteがtrueを返しキーが削除される", () => {
  const cache = createCache<string, number>();
  cache.set("a", 1);
  expect(cache.delete("a")).toBe(true);
  expect(cache.has("a")).toBe(false);
  expect(cache.size).toBe(0);
});

test("存在しないキーのdeleteがfalseを返す", () => {
  const cache = createCache<string, number>();
  expect(cache.delete("missing")).toBe(false);
});

test("clearで全エントリを削除できる", () => {
  const cache = createCache<string, number>();
  cache.set("a", 1);
  cache.set("b", 2);
  cache.clear();
  expect(cache.size).toBe(0);
  expect(cache.has("a")).toBe(false);
  expect(cache.has("b")).toBe(false);
});

test("容量超過時に最古のエントリが削除される", () => {
  const cache = createCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  expect(cache.has("a")).toBe(false);
  expect(cache.get("b")).toBe(2);
  expect(cache.get("c")).toBe(3);
  expect(cache.size).toBe(2);
});

test("getアクセスによりエントリの順序が更新される", () => {
  const cache = createCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.get("a");
  cache.set("c", 3);
  expect(cache.has("a")).toBe(true);
  expect(cache.has("b")).toBe(false);
  expect(cache.has("c")).toBe(true);
});

test("setによる上書きでエントリの順序が更新される", () => {
  const cache = createCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("a", 10);
  cache.set("c", 3);
  expect(cache.has("a")).toBe(true);
  expect(cache.has("b")).toBe(false);
  expect(cache.has("c")).toBe(true);
  expect(cache.get("a")).toBe(10);
});

test("容量1のキャッシュで正しく動作する", () => {
  const cache = createCache<string, number>(1);
  cache.set("a", 1);
  expect(cache.get("a")).toBe(1);
  cache.set("b", 2);
  expect(cache.has("a")).toBe(false);
  expect(cache.get("b")).toBe(2);
  expect(cache.size).toBe(1);
});

test("連続した追い出しが正しく動作する", () => {
  const cache = createCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  cache.set("d", 4);
  expect(cache.has("a")).toBe(false);
  expect(cache.has("b")).toBe(false);
  expect(cache.get("c")).toBe(3);
  expect(cache.get("d")).toBe(4);
});

test("容量0でErrが返される", () => {
  const result = LRUCache.create(0);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(RangeError);
  }
});

test("負の容量でErrが返される", () => {
  const result = LRUCache.create(-1);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(RangeError);
  }
});

test("小数の容量でErrが返される", () => {
  const result = LRUCache.create(1.5);
  expect(result.ok).toBe(false);
});

test("NaNの容量でErrが返される", () => {
  const result = LRUCache.create(NaN);
  expect(result.ok).toBe(false);
});

test("Infinityの容量でErrが返される", () => {
  const result = LRUCache.create(Infinity);
  expect(result.ok).toBe(false);
});

test("デフォルト容量が1024である", () => {
  const cache = createCache<string, number>();
  for (let i = 0; i < 1024; i++) {
    cache.set(`key${i}`, i);
  }
  expect(cache.size).toBe(1024);
  cache.set("overflow", 9999);
  expect(cache.size).toBe(1024);
  expect(cache.has("key0")).toBe(false);
});

// --- falsy値テスト ---

test.each([
  ["0", 0],
  ["false", false],
  ["empty string", ""],
  ["null", null],
  ["undefined", undefined],
])("falsy値 %s をset/getできる", (_label, value) => {
  const cache = createCache<string, unknown>(3);
  cache.set("key", value);
  expect(cache.get("key")).toBe(value);
  expect(cache.has("key")).toBe(true);
});

// --- delete/clear後の再挿入 ---

test("delete後の再挿入で不要なevictionが起きない", () => {
  const cache = createCache<string, number>(3);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  cache.delete("b");
  cache.set("d", 4);
  expect(cache.size).toBe(3);
  expect(cache.has("a")).toBe(true);
  expect(cache.has("c")).toBe(true);
  expect(cache.has("d")).toBe(true);
});

test("clear後の再挿入でcapacity分まで挿入できる", () => {
  const cache = createCache<string, number>(3);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  cache.clear();
  cache.set("x", 10);
  cache.set("y", 20);
  cache.set("z", 30);
  expect(cache.size).toBe(3);
  expect(cache.has("x")).toBe(true);
  expect(cache.has("y")).toBe(true);
  expect(cache.has("z")).toBe(true);
});

// --- has() recency非更新 ---

test("has()がLRU順序を変更しない", () => {
  const cache = createCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.has("a");
  cache.set("c", 3);
  expect(cache.has("a")).toBe(false);
  expect(cache.has("b")).toBe(true);
  expect(cache.has("c")).toBe(true);
});
