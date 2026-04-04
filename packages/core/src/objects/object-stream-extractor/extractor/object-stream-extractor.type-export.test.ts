import { expect, test } from "vitest";
import type {
  CreateFlateDecompressorOptions,
  ObjectStreamExtractorDeps,
  ObjectStreamHeaderEntry,
  StreamDecompressor,
  StreamObjectParser,
  StreamResolver,
} from "../../../index";
import { ObjectStreamExtractor, ObjectStreamHeader } from "../../../index";

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
  const deps: ObjectStreamExtractorDeps = { resolver, parser, decompressor };
  const options: CreateFlateDecompressorOptions = { maxDecompressedSize: 1024 };

  expect(deps.resolver).toBe(resolver);
  expect(deps.parser).toBe(parser);
  expect(deps.decompressor).toBe(decompressor);
  expect(options.maxDecompressedSize).toBe(1024);
});

test("ObjectStreamExtractorがルートからインポート可能である", () => {
  expect(typeof ObjectStreamExtractor.create).toBe("function");
});

test("ObjectStreamHeader.parseがルートからインポート可能である", () => {
  expect(typeof ObjectStreamHeader.parse).toBe("function");
});

test("ObjectStreamHeaderEntryが型として利用可能である", () => {
  const entry: ObjectStreamHeaderEntry = {
    objNum: 10 as never,
    offset: 0 as never,
  };
  expect(entry.objNum).toBe(10);
  expect(entry.offset).toBe(0);
});
