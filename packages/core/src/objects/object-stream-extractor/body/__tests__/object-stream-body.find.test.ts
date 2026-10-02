import { assert, expect, test } from "vitest";
import { ObjectNumber } from "../../../../pdf/types/object-number/index";
import { LRUCache } from "../../../../utils/lru-cache/index";
import { none, some } from "../../../../utils/option/index";
import { buildStoredZlib } from "../../flate-decompressor/__tests__/flate-decompressor.test.helpers";
import { ObjectStreamBody } from "../../index";
import {
  makeRawObjStm,
  makeStreamObj,
} from "./object-stream-body.test.helpers";

test.each([
  { target: 10, expected: true },
  { target: 11, expected: false },
])("ObjStm内の番号 $target を検索して対応する値を返す", async ({
  target,
  expected,
}) => {
  const stream = makeRawObjStm({
    header: "10 0 11 5 ",
    body: "true false",
    n: 2,
  });
  const result = await ObjectStreamBody.find({
    stream,
    streamObjNum: ObjectNumber.of(15),
    targetObjNum: ObjectNumber.of(target),
  });
  assert(result.ok);
  expect(result.value).toEqual(some({ type: "boolean", value: expected }));
});

test("ObjStm内に対象番号がなければNoneを返す", async () => {
  const stream = makeRawObjStm({ header: "10 0 ", body: "true", n: 1 });
  const result = await ObjectStreamBody.find({
    stream,
    streamObjNum: ObjectNumber.of(15),
    targetObjNum: ObjectNumber.of(11),
  });
  assert(result.ok);
  expect(result.value).toEqual(none);
});

test("N=0, First=0の空ObjStmはNoneを返す", async () => {
  const stream = makeRawObjStm({ header: "", body: "", n: 0 });
  const result = await ObjectStreamBody.find({
    stream,
    streamObjNum: ObjectNumber.of(15),
    targetObjNum: ObjectNumber.of(10),
  });
  assert(result.ok);
  expect(result.value).toEqual(none);
});

test("FlateDecodeのObjStmをキャッシュなしで検索できる", async () => {
  const raw = makeRawObjStm({ header: "10 0 11 5 ", body: "true false", n: 2 });
  raw.dictionary.entries.set("Filter", { type: "name", value: "FlateDecode" });
  const stream = makeStreamObj(buildStoredZlib(raw.data), raw.dictionary);
  const result = await ObjectStreamBody.find({
    stream,
    streamObjNum: ObjectNumber.of(15),
    targetObjNum: ObjectNumber.of(11),
  });
  assert(result.ok);
  expect(result.value).toEqual(some({ type: "boolean", value: false }));
});

test("同じストリーム番号の展開済みキャッシュで繰り返し検索できる", async () => {
  const raw = makeRawObjStm({ header: "10 0 11 5 ", body: "true false", n: 2 });
  raw.dictionary.entries.set("Filter", { type: "name", value: "FlateDecode" });
  const stream = makeStreamObj(buildStoredZlib(raw.data), raw.dictionary);
  const cacheResult = LRUCache.create<ObjectNumber, Uint8Array>(2);
  assert(cacheResult.ok);
  const cache = cacheResult.value;
  const first = await ObjectStreamBody.find({
    stream,
    cache,
    streamObjNum: ObjectNumber.of(15),
    targetObjNum: ObjectNumber.of(11),
  });
  assert(first.ok);
  expect(first.value).toEqual(some({ type: "boolean", value: false }));
  const second = await ObjectStreamBody.find({
    stream: { ...stream, data: Uint8Array.of(0) },
    cache,
    streamObjNum: ObjectNumber.of(15),
    targetObjNum: ObjectNumber.of(11),
  });
  assert(second.ok);
  expect(second.value).toEqual(some({ type: "boolean", value: false }));
});

test("1000ペアのヘッダの末尾にある番号も検索できる", async () => {
  const n = 1000;
  const header = Array.from(
    { length: n },
    (_, index) => `${index + 1} ${index * 3} `,
  ).join("");
  const stream = makeRawObjStm({ header, body: "42 ".repeat(n), n });
  const result = await ObjectStreamBody.find({
    stream,
    streamObjNum: ObjectNumber.of(1001),
    targetObjNum: ObjectNumber.of(1000),
  });
  assert(result.ok);
  expect(result.value).toEqual(some({ type: "integer", value: 42 }));
});
