import { assert, expect, test } from "vitest";
import type { PdfError, PdfParseError } from "../../errors/index";
import type { Result } from "../../result/index";
import { err, ok } from "../../result/index";
import { GenerationNumber } from "../../types/generation-number/index";
import { ObjectNumber } from "../../types/object-number/index";
import type { PdfDictionary, PdfObject } from "../../types/pdf-types/index";
import type {
  ObjectStreamExtractorDeps,
  StreamDecompressor,
  StreamObjectParser,
  StreamResolver,
} from "./index";
import { ObjectStreamExtractor } from "./index";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

function makeObjStmDict(
  overrides: Record<string, PdfObject> = {},
): PdfDictionary {
  const defaults: Record<string, PdfObject> = {
    Type: { type: "name", value: "ObjStm" },
    First: { type: "integer", value: 4 },
    N: { type: "integer", value: 1 },
    Filter: { type: "name", value: "FlateDecode" },
  };
  return {
    type: "dictionary",
    entries: new Map(Object.entries({ ...defaults, ...overrides })),
  };
}

function makeStreamObj(data: Uint8Array, dict?: PdfDictionary): PdfObject {
  return {
    type: "stream",
    dictionary: dict ?? makeObjStmDict(),
    data,
  };
}

function stubResolver(result: Result<PdfObject, PdfError>): StreamResolver {
  return { resolve: () => Promise.resolve(result) };
}

function stubDecompressor(
  result: Result<Uint8Array, PdfParseError>,
): StreamDecompressor {
  return { decompress: () => Promise.resolve(result) };
}

function stubParser(
  result: Result<PdfObject, PdfParseError>,
): StreamObjectParser {
  return { parse: () => result };
}

function createExtractor(
  deps: Partial<ObjectStreamExtractorDeps> = {},
): ObjectStreamExtractor {
  const defaultDeps: ObjectStreamExtractorDeps = {
    resolver: stubResolver(ok(makeStreamObj(enc("10 0 true")))),
    decompressor: stubDecompressor(ok(enc("10 0 true"))),
    parser: stubParser(ok({ type: "boolean", value: true })),
    ...deps,
  };
  const result = ObjectStreamExtractor.create(defaultDeps);
  assert(result.ok);
  return result.value;
}

test("オブジェクトストリームから指定インデックスのオブジェクトを抽出できる", async () => {
  const decompressed = enc("10 0 true");
  const extractor = createExtractor({
    resolver: stubResolver(ok(makeStreamObj(enc("compressed")))),
    decompressor: stubDecompressor(ok(decompressed)),
    parser: stubParser(ok({ type: "boolean", value: true })),
  });

  const result = await extractor.extract(
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(result.ok);
  expect(result.value).toEqual({ type: "boolean", value: true });
});

test("/Filter不在の未圧縮ObjStmからオブジェクトを抽出できる", async () => {
  const rawData = enc("10 0 true");
  const dict = makeObjStmDict();
  dict.entries.delete("Filter");
  const decompressorCalled = { value: false };

  const extractor = createExtractor({
    resolver: stubResolver(
      ok({ type: "stream", dictionary: dict, data: rawData }),
    ),
    decompressor: {
      decompress: () => {
        decompressorCalled.value = true;
        return Promise.resolve(ok(rawData));
      },
    },
    parser: stubParser(ok({ type: "boolean", value: true })),
  });

  const result = await extractor.extract(
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(result.ok);
  expect(decompressorCalled.value).toBe(false);
});

test("同一ストリームの2回目のアクセスでキャッシュから展開済みデータを取得し展開をスキップする", async () => {
  const decompressed = enc("10 0 11 5 true << /K /V >>");
  let decompressCount = 0;

  const dict = makeObjStmDict({
    N: { type: "integer", value: 2 },
    First: { type: "integer", value: 10 },
  });

  const extractor = createExtractor({
    resolver: stubResolver(
      ok({ type: "stream", dictionary: dict, data: enc("compressed") }),
    ),
    decompressor: {
      decompress: () => {
        decompressCount++;
        return Promise.resolve(ok(decompressed));
      },
    },
    parser: stubParser(ok({ type: "boolean", value: true })),
  });

  const r1 = await extractor.extract(
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(r1.ok);
  expect(decompressCount).toBe(1);

  const r2 = await extractor.extract(
    ObjectNumber.of(11),
    ObjectNumber.of(15),
    1,
  );
  assert(r2.ok);
  expect(decompressCount).toBe(1);
});

test("StreamResolverがエラーを返した場合にエラーを伝播する", async () => {
  const extractor = createExtractor({
    resolver: stubResolver(
      err({
        code: "CIRCULAR_REFERENCE",
        message: "circular",
        objectId: {
          objectNumber: ObjectNumber.of(15),
          generationNumber: GenerationNumber.of(0),
        },
      }),
    ),
  });

  const result = await extractor.extract(
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("CIRCULAR_REFERENCE");
});

test("解決されたオブジェクトがstream型でない場合にエラーを返す", async () => {
  const extractor = createExtractor({
    resolver: stubResolver(ok({ type: "dictionary", entries: new Map() })),
  });

  const result = await extractor.extract(
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});

test("StreamDecompressorがエラーを返した場合にエラーを伝播する", async () => {
  const extractor = createExtractor({
    decompressor: stubDecompressor(
      err({
        code: "FLATEDECODE_FAILED",
        message: "decompress failed",
      }),
    ),
  });

  const result = await extractor.extract(
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("FLATEDECODE_FAILED");
});

test("インデックスが/N以上の場合にエラーを返す", async () => {
  const extractor = createExtractor();
  const result = await extractor.extract(
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    5,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INDEX_OUT_OF_RANGE");
});

test("インデックスが負値の場合にエラーを返す", async () => {
  const extractor = createExtractor();
  const result = await extractor.extract(
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    -1,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});

test("インデックスが非整数の場合にエラーを返す", async () => {
  const extractor = createExtractor();
  const result = await extractor.extract(
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0.5,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});

test("/Firstが展開済みデータ長を超える場合にエラーを返す", async () => {
  const dict = makeObjStmDict({ First: { type: "integer", value: 999 } });
  const extractor = createExtractor({
    resolver: stubResolver(
      ok({ type: "stream", dictionary: dict, data: enc("x") }),
    ),
    decompressor: stubDecompressor(ok(enc("short"))),
  });

  const result = await extractor.extract(
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("/First");
});

test("ヘッダのトークンが不足している場合にエラーを返す", async () => {
  const decompressed = enc("10 extra_object_data");
  const dict = makeObjStmDict({
    N: { type: "integer", value: 1 },
    First: { type: "integer", value: 3 },
  });

  const extractor = createExtractor({
    resolver: stubResolver(
      ok({ type: "stream", dictionary: dict, data: enc("x") }),
    ),
    decompressor: stubDecompressor(ok(decompressed)),
  });

  const result = await extractor.extract(
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_HEADER_INVALID");
});

test("対象オブジェクトのoffsetが展開済みデータの本文範囲外の場合にエラーを返す", async () => {
  const decompressed = enc("10 999 x");
  const dict = makeObjStmDict({
    First: { type: "integer", value: 6 },
    N: { type: "integer", value: 1 },
  });

  const extractor = createExtractor({
    resolver: stubResolver(
      ok({ type: "stream", dictionary: dict, data: enc("x") }),
    ),
    decompressor: stubDecompressor(ok(decompressed)),
  });

  const result = await extractor.extract(
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("offset");
});

test("StreamObjectParserがエラーを返した場合にエラーを伝播する", async () => {
  const extractor = createExtractor({
    parser: stubParser(
      err({
        code: "OBJECT_STREAM_INVALID",
        message: "parse failed",
      }),
    ),
  });

  const result = await extractor.extract(
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});

test("抽出結果がstream型の場合にエラーを返す", async () => {
  const extractor = createExtractor({
    parser: stubParser(
      ok({
        type: "stream",
        dictionary: { type: "dictionary", entries: new Map() },
        data: new Uint8Array(),
      }),
    ),
  });

  const result = await extractor.extract(
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("stream");
});

test("ヘッダのobjNumがtargetObjNumと不一致の場合にエラーを返す", async () => {
  const decompressed = enc("99 0 true");
  const extractor = createExtractor({
    resolver: stubResolver(ok(makeStreamObj(enc("compressed")))),
    decompressor: stubDecompressor(ok(decompressed)),
  });

  const result = await extractor.extract(
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("does not match");
});

test("同一ストリームの異なるインデックスのオブジェクトを抽出できる", async () => {
  const decompressed = enc("10 0 11 5 true << /K /V >>");
  const dict = makeObjStmDict({
    N: { type: "integer", value: 2 },
    First: { type: "integer", value: 10 },
  });

  let parseCallData: Uint8Array = new Uint8Array(0);
  const extractor = createExtractor({
    resolver: stubResolver(
      ok({ type: "stream", dictionary: dict, data: enc("compressed") }),
    ),
    decompressor: stubDecompressor(ok(decompressed)),
    parser: {
      parse: (data: Uint8Array, offset: number) => {
        parseCallData = data;
        expect(offset).toBe(0);
        return ok({ type: "boolean", value: true });
      },
    },
  });

  const r1 = await extractor.extract(
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(r1.ok);
  expect(new TextDecoder().decode(parseCallData)).toBe("true ");

  const r2 = await extractor.extract(
    ObjectNumber.of(11),
    ObjectNumber.of(15),
    1,
  );
  assert(r2.ok);
  expect(new TextDecoder().decode(parseCallData)).toBe("<< /K /V >>");
});

test("extractはオブジェクトデータ範囲が空の場合にエラーを返す", async () => {
  const decompressed = enc("10 0 11 0 true << /K /V >>");
  const dict = makeObjStmDict({
    N: { type: "integer", value: 2 },
    First: { type: "integer", value: 10 },
  });

  const extractor = createExtractor({
    resolver: stubResolver(
      ok({ type: "stream", dictionary: dict, data: enc("compressed") }),
    ),
    decompressor: stubDecompressor(ok(decompressed)),
    parser: {
      parse: () => ok({ type: "boolean", value: true }),
    },
  });

  const result = await extractor.extract(
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("empty");
});
