import { assert, expect, test, vi } from "vitest";
import { err, ok } from "../../../utils/result/index";
import { ByteOffset } from "../../../types/byte-offset/index";
import { GenerationNumber } from "../../../types/generation-number/index";
import { ObjectNumber } from "../../../types/object-number/index";
import { LRUCache } from "../../lru-cache/index";
import { ObjectParser } from "../../object-parser/index";
import * as flateDecompressorModule from "../flate-decompressor/index";
import { ObjectStreamBody } from "./index";
import {
  enc,
  makeObjStmDict,
  stubResolver,
} from "./object-stream-body.test.helpers";

test("オブジェクトストリームから指定インデックスのオブジェクトを抽出できる", async () => {
  const data = enc("10 0 true");
  const dict = makeObjStmDict();
  dict.entries.delete("Filter");
  const resolver = stubResolver(ok({ type: "stream", dictionary: dict, data }));
  const parseSpy = vi
    .spyOn(ObjectParser, "parse")
    .mockReturnValue(ok({ type: "boolean", value: true }));

  try {
    const result = await ObjectStreamBody.extract(
      resolver,
      undefined,
      ObjectNumber.of(10),
      ObjectNumber.of(15),
      0,
    );
    assert(result.ok);
    expect(result.value).toEqual({ type: "boolean", value: true });
  } finally {
    parseSpy.mockRestore();
  }
});

test("/Filter不在の未圧縮ObjStmからオブジェクトを抽出できる", async () => {
  const rawData = enc("10 0 true");
  const dict = makeObjStmDict();
  dict.entries.delete("Filter");
  const resolver = stubResolver(
    ok({ type: "stream", dictionary: dict, data: rawData }),
  );
  const flateSpy = vi.spyOn(flateDecompressorModule, "createFlateDecompressor");
  const parseSpy = vi
    .spyOn(ObjectParser, "parse")
    .mockReturnValue(ok({ type: "boolean", value: true }));

  try {
    const result = await ObjectStreamBody.extract(
      resolver,
      undefined,
      ObjectNumber.of(10),
      ObjectNumber.of(15),
      0,
    );
    assert(result.ok);
    expect(flateSpy).not.toHaveBeenCalled();
  } finally {
    flateSpy.mockRestore();
    parseSpy.mockRestore();
  }
});

test("同一ストリームの2回目のアクセスでキャッシュから展開済みデータを取得し展開をスキップする", async () => {
  const decompressed = enc("10 0 11 5 true << /K /V >>");
  let decompressCount = 0;

  const dict = makeObjStmDict({
    N: { type: "integer", value: 2 },
    First: { type: "integer", value: 10 },
  });

  const resolver = stubResolver(
    ok({ type: "stream", dictionary: dict, data: enc("compressed") }),
  );
  const parseSpy = vi
    .spyOn(ObjectParser, "parse")
    .mockReturnValue(ok({ type: "boolean", value: true }));
  const flateSpy = vi
    .spyOn(flateDecompressorModule, "createFlateDecompressor")
    .mockReturnValue({
      decompress: () => {
        decompressCount++;
        return Promise.resolve(ok(decompressed));
      },
    });

  try {
    const cacheResult = LRUCache.create<ObjectNumber, Uint8Array>(8);
    assert(cacheResult.ok);
    const cache = cacheResult.value;

    const r1 = await ObjectStreamBody.extract(
      resolver,
      cache,
      ObjectNumber.of(10),
      ObjectNumber.of(15),
      0,
    );
    assert(r1.ok);
    expect(decompressCount).toBe(1);

    const r2 = await ObjectStreamBody.extract(
      resolver,
      cache,
      ObjectNumber.of(11),
      ObjectNumber.of(15),
      1,
    );
    assert(r2.ok);
    expect(decompressCount).toBe(1);
  } finally {
    flateSpy.mockRestore();
    parseSpy.mockRestore();
  }
});

test("StreamResolverがエラーを返した場合にエラーを伝播する", async () => {
  const resolver = stubResolver(
    err({
      code: "CIRCULAR_REFERENCE",
      message: "circular",
      objectId: {
        objectNumber: ObjectNumber.of(15),
        generationNumber: GenerationNumber.of(0),
      },
    }),
  );

  const result = await ObjectStreamBody.extract(
    resolver,
    undefined,
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("CIRCULAR_REFERENCE");
});

test("解決されたオブジェクトがstream型でない場合にエラーを返す", async () => {
  const resolver = stubResolver(ok({ type: "dictionary", entries: new Map() }));

  const result = await ObjectStreamBody.extract(
    resolver,
    undefined,
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});

test("FlateDecode展開がエラーを返した場合にエラーを伝播する", async () => {
  const dict = makeObjStmDict();
  const resolver = stubResolver(
    ok({ type: "stream", dictionary: dict, data: enc("compressed") }),
  );
  const flateSpy = vi
    .spyOn(flateDecompressorModule, "createFlateDecompressor")
    .mockReturnValue({
      decompress: () =>
        Promise.resolve(
          err({
            code: "FLATEDECODE_FAILED",
            message: "decompress failed",
          }),
        ),
    });

  try {
    const result = await ObjectStreamBody.extract(
      resolver,
      undefined,
      ObjectNumber.of(10),
      ObjectNumber.of(15),
      0,
    );
    assert(!result.ok);
    expect(result.error.code).toBe("FLATEDECODE_FAILED");
  } finally {
    flateSpy.mockRestore();
  }
});

test("インデックスが/N以上の場合にエラーを返す", async () => {
  const data = enc("10 0 true");
  const dict = makeObjStmDict();
  dict.entries.delete("Filter");
  const resolver = stubResolver(ok({ type: "stream", dictionary: dict, data }));

  const result = await ObjectStreamBody.extract(
    resolver,
    undefined,
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    5,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INDEX_OUT_OF_RANGE");
});

test("インデックスが負値の場合にエラーを返す", async () => {
  const resolver = stubResolver(ok({ type: "null" }));

  const result = await ObjectStreamBody.extract(
    resolver,
    undefined,
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    -1,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});

test("インデックスが非整数の場合にエラーを返す", async () => {
  const resolver = stubResolver(ok({ type: "null" }));

  const result = await ObjectStreamBody.extract(
    resolver,
    undefined,
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0.5,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});

test("/Firstが展開済みデータ長を超える場合にエラーを返す", async () => {
  const dict = makeObjStmDict({ First: { type: "integer", value: 999 } });
  dict.entries.delete("Filter");
  const resolver = stubResolver(
    ok({ type: "stream", dictionary: dict, data: enc("short") }),
  );

  const result = await ObjectStreamBody.extract(
    resolver,
    undefined,
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("/First");
});

test("ヘッダのトークンが不足している場合にエラーを返す", async () => {
  const data = enc("10 extra_object_data");
  const dict = makeObjStmDict({
    N: { type: "integer", value: 1 },
    First: { type: "integer", value: 3 },
  });
  dict.entries.delete("Filter");
  const resolver = stubResolver(ok({ type: "stream", dictionary: dict, data }));

  const result = await ObjectStreamBody.extract(
    resolver,
    undefined,
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_HEADER_INVALID");
});

test("対象オブジェクトのoffsetが展開済みデータの本文範囲外の場合にエラーを返す", async () => {
  const data = enc("10 999 x");
  const dict = makeObjStmDict({
    First: { type: "integer", value: 6 },
    N: { type: "integer", value: 1 },
  });
  dict.entries.delete("Filter");
  const resolver = stubResolver(ok({ type: "stream", dictionary: dict, data }));

  const result = await ObjectStreamBody.extract(
    resolver,
    undefined,
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("offset");
});

test("ObjectParser.parseがエラーを返した場合にエラーを伝播する", async () => {
  const data = enc("10 0 true");
  const dict = makeObjStmDict();
  dict.entries.delete("Filter");
  const resolver = stubResolver(ok({ type: "stream", dictionary: dict, data }));
  const parseSpy = vi
    .spyOn(ObjectParser, "parse")
    .mockReturnValue(
      err({ code: "OBJECT_STREAM_INVALID", message: "parse failed" }),
    );

  try {
    const result = await ObjectStreamBody.extract(
      resolver,
      undefined,
      ObjectNumber.of(10),
      ObjectNumber.of(15),
      0,
    );
    assert(!result.ok);
    expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  } finally {
    parseSpy.mockRestore();
  }
});

test("抽出結果がstream型の場合にエラーを返す", async () => {
  const data = enc("10 0 true");
  const dict = makeObjStmDict();
  dict.entries.delete("Filter");
  const resolver = stubResolver(ok({ type: "stream", dictionary: dict, data }));
  const parseSpy = vi.spyOn(ObjectParser, "parse").mockReturnValue(
    ok({
      type: "stream",
      dictionary: { type: "dictionary", entries: new Map() },
      data: new Uint8Array(),
    }),
  );

  try {
    const result = await ObjectStreamBody.extract(
      resolver,
      undefined,
      ObjectNumber.of(10),
      ObjectNumber.of(15),
      0,
    );
    assert(!result.ok);
    expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
    expect(result.error.message).toContain("stream");
  } finally {
    parseSpy.mockRestore();
  }
});

test("ヘッダのobjNumがtargetObjNumと不一致の場合にエラーを返す", async () => {
  const data = enc("99 0 true");
  const dict = makeObjStmDict();
  dict.entries.delete("Filter");
  const resolver = stubResolver(ok({ type: "stream", dictionary: dict, data }));

  const result = await ObjectStreamBody.extract(
    resolver,
    undefined,
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("does not match");
});

test("同一ストリームの異なるインデックスのオブジェクトを抽出できる", async () => {
  const data = enc("10 0 11 5 true << /K /V >>");
  const dict = makeObjStmDict({
    N: { type: "integer", value: 2 },
    First: { type: "integer", value: 10 },
  });
  dict.entries.delete("Filter");
  const resolver = stubResolver(ok({ type: "stream", dictionary: dict, data }));

  let parseCallData: Uint8Array = new Uint8Array(0);
  const parseSpy = vi
    .spyOn(ObjectParser, "parse")
    .mockImplementation((callData: Uint8Array, offset: ByteOffset) => {
      parseCallData = callData;
      expect(offset).toBe(ByteOffset.of(0));
      return ok({ type: "boolean", value: true });
    });

  try {
    const r1 = await ObjectStreamBody.extract(
      resolver,
      undefined,
      ObjectNumber.of(10),
      ObjectNumber.of(15),
      0,
    );
    assert(r1.ok);
    expect(new TextDecoder().decode(parseCallData)).toBe("true ");

    const r2 = await ObjectStreamBody.extract(
      resolver,
      undefined,
      ObjectNumber.of(11),
      ObjectNumber.of(15),
      1,
    );
    assert(r2.ok);
    expect(new TextDecoder().decode(parseCallData)).toBe("<< /K /V >>");
  } finally {
    parseSpy.mockRestore();
  }
});

test("extractはオブジェクトデータ範囲が空の場合にエラーを返す", async () => {
  const data = enc("10 0 11 0 true << /K /V >>");
  const dict = makeObjStmDict({
    N: { type: "integer", value: 2 },
    First: { type: "integer", value: 10 },
  });
  dict.entries.delete("Filter");
  const resolver = stubResolver(ok({ type: "stream", dictionary: dict, data }));

  const result = await ObjectStreamBody.extract(
    resolver,
    undefined,
    ObjectNumber.of(10),
    ObjectNumber.of(15),
    0,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("empty");
});

test("cache=undefinedでキャッシュ無効化して正常に抽出できる", async () => {
  const data = enc("10 0 true");
  const dict = makeObjStmDict({
    N: { type: "integer", value: 1 },
    First: { type: "integer", value: 4 },
  });
  dict.entries.delete("Filter");
  const resolver = stubResolver(ok({ type: "stream", dictionary: dict, data }));
  const parseSpy = vi
    .spyOn(ObjectParser, "parse")
    .mockReturnValue(ok({ type: "boolean", value: true }));

  try {
    const result = await ObjectStreamBody.extract(
      resolver,
      undefined,
      ObjectNumber.of(10),
      ObjectNumber.of(15),
      0,
    );
    assert(result.ok);
    expect(result.value).toStrictEqual({ type: "boolean", value: true });
  } finally {
    parseSpy.mockRestore();
  }
});
