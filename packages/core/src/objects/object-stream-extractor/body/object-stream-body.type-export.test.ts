import { expect, test } from "vitest";
import type { ObjectStreamHeaderEntry, StreamResolver } from "../../../index";
import {
  ByteOffset,
  ObjectNumber,
  ObjectStreamBody,
  ObjectStreamHeader,
} from "../../../index";

test("公開型がルートからインポート可能である", () => {
  const resolver: StreamResolver = {
    resolve: () => Promise.resolve({ ok: true, value: { type: "null" } }),
  };

  expect(resolver.resolve).toBeDefined();
});

test("ObjectStreamBody.extractがルートからインポート可能である", () => {
  expect(typeof ObjectStreamBody.extract).toBe("function");
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
