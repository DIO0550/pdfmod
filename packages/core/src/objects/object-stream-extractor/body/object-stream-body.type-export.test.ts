import { expect, test } from "vitest";
import type {
  CreateFlateDecompressorOptions,
  ObjectStreamBodyDeps,
  ObjectStreamHeaderEntry,
  StreamDecompressor,
  StreamObjectParser,
  StreamResolver,
} from "../../../index";
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
  const parser: StreamObjectParser = {
    parse: () => ({ ok: true, value: { type: "null" } }),
  };
  const decompressor: StreamDecompressor = {
    decompress: () => Promise.resolve({ ok: true, value: new Uint8Array() }),
  };
  const deps: ObjectStreamBodyDeps = { resolver, parser, decompressor };
  const options: CreateFlateDecompressorOptions = { maxDecompressedSize: 1024 };

  expect(deps.resolver).toBe(resolver);
  expect(deps.parser).toBe(parser);
  expect(deps.decompressor).toBe(decompressor);
  expect(options.maxDecompressedSize).toBe(1024);
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
