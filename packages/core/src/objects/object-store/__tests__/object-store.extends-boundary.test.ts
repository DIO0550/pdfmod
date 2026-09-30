import { assert, expect, test } from "vitest";
import { ObjectStore } from "../index";
import {
  makeChainSource,
  makeCollectionSource,
  type ObjectStreamFixture,
} from "./object-store.extends.test.helpers";
import { makeRef } from "./object-store.test.helpers";

test.each([
  {
    label: "自己循環",
    streams: [
      {
        objectNumber: 10,
        extendsRef: { objectNumber: 10 },
        objects: [{ objectNumber: 5, body: "true" }],
      },
    ],
  },
  {
    label: "二段循環",
    streams: [
      { objectNumber: 10, extendsRef: { objectNumber: 20 } },
      { objectNumber: 20, extendsRef: { objectNumber: 10 } },
    ],
  },
] satisfies readonly {
  readonly label: string;
  readonly streams: readonly ObjectStreamFixture[];
}[])("Extendsの$labelを検出する", async ({ streams }) => {
  const storeResult = ObjectStore.create(makeCollectionSource(streams));
  assert(storeResult.ok);
  const result = await storeResult.value.get(makeRef(5));
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("/Extends cycle");
  expect(result.error.message).toContain("10-0");
});

test("起点を含む64件のExtendsチェーンは末尾の値を解決する", async () => {
  const storeResult = ObjectStore.create(makeChainSource(64), {
    streamCacheCapacity: false,
  });
  assert(storeResult.ok);
  const result = await storeResult.value.get(makeRef(5));
  assert(result.ok);
  expect(result.value).toEqual({ type: "integer", value: 42 });
});

test("65件のExtendsチェーンは上限超過になる", async () => {
  const storeResult = ObjectStore.create(makeChainSource(65));
  assert(storeResult.ok);
  const result = await storeResult.value.get(makeRef(5));
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("exceeds 64 streams");
});

test("子で値が見つかっても64件目から先の親を解決する前に上限超過になる", async () => {
  const streams = Array.from(
    { length: 64 },
    (_, index): ObjectStreamFixture => ({
      objectNumber: 10 + index,
      extendsRef: { objectNumber: 11 + index },
      objects: index === 0 ? [{ objectNumber: 5, body: "true" }] : [],
    }),
  );
  const storeResult = ObjectStore.create(makeCollectionSource(streams));
  assert(storeResult.ok);
  const result = await storeResult.value.get(makeRef(5));
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("exceeds 64 streams");
});
