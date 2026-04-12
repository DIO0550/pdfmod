import { expect, test } from "vitest";
import type {
  ObjectStoreOptions,
  ObjectStoreSource,
  StreamResolver,
} from "../../index";
import { ObjectStore } from "../../index";

test("ObjectStore と公開型がルートからインポート可能である", () => {
  expect(typeof ObjectStore.create).toBe("function");

  const source: ObjectStoreSource = {
    xref: { entries: new Map(), size: 0 },
    data: new Uint8Array(),
  };
  expect(source.data).toBeInstanceOf(Uint8Array);

  const options: ObjectStoreOptions = { cacheCapacity: 128 };
  expect(options.cacheCapacity).toBe(128);

  const resolver: StreamResolver = {
    resolve: () => Promise.resolve({ ok: true, value: { type: "null" } }),
  };
  expect(resolver.resolve).toBeDefined();
});

test("削除された型はルートからインポートできない", () => {
  // @ts-expect-error ObjectResolverConfig は削除済み
  const _a: import("../../index").ObjectResolverConfig = {};
  // @ts-expect-error ObjectResolverDeps は削除済み
  const _b: import("../../index").ObjectResolverDeps = {};
  // @ts-expect-error ObjectStreamExtractDeps は削除済み
  const _c: import("../../index").ObjectStreamExtractDeps = {};
  // @ts-expect-error ObjectStreamBodyDeps は削除済み
  const _d: import("../../index").ObjectStreamBodyDeps = {};
  // @ts-expect-error StreamObjectParser は削除済み
  const _e: import("../../index").StreamObjectParser = {};
  // @ts-expect-error StreamDecompressor は削除済み
  const _f: import("../../index").StreamDecompressor = {};
  // @ts-expect-error CreateFlateDecompressorOptions は削除済み
  const _g: import("../../index").CreateFlateDecompressorOptions = {};

  expect(true).toBe(true);
});
