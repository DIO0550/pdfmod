import { expect, test } from "vitest";
import type { ObjectStreamHeaderEntry } from "../../../../index";
import {
  ByteOffset,
  ObjectNumber,
  ObjectStreamHeader,
} from "../../../../index";
import { ObjectStreamBody, type ObjectStreamExtractOptions } from "../../index";

test("ObjectStreamBody.extractがモジュールからインポート可能である", () => {
  expect(typeof ObjectStreamBody.extract).toBe("function");
});

test("ObjectStreamExtractOptionsが型として利用可能である", () => {
  type _Options = ObjectStreamExtractOptions;
  expect(true).toBe(true);
});

test("StreamResolverは削除されている", () => {
  // @ts-expect-error StreamResolver は削除済み
  type _Resolver = import("../../index").StreamResolver;
  expect(true).toBe(true);
});

test("ObjectStreamHeader.parseがルートからインポート可能である", () => {
  expect(typeof ObjectStreamHeader.parse).toBe("function");
});

test("ObjectStreamHeaderEntryが型として利用可能である", () => {
  const entry: ObjectStreamHeaderEntry = {
    objNum: ObjectNumber.of(10),
    offset: ByteOffset.of(0),
  };
  expect(entry.objNum).toBe(ObjectNumber.of(10));
  expect(entry.offset).toBe(ByteOffset.of(0));
});
