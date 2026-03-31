import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../types/pdf-types/index";
import { parseHeader, validateStreamDict } from "./index";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

// --- parseHeader ---

test("parseHeaderは1つのobjNum/offsetペアを持つヘッダをパースできる", () => {
  const data = enc("10 0 << /Key /Value >>");
  const result = parseHeader(data, 4, 1);
  assert(result.ok);
  expect(result.value).toEqual([{ objNum: 10, offset: 0 }]);
});

test("parseHeaderは複数のobjNum/offsetペアを持つヘッダをパースできる", () => {
  const data = enc("10 0 11 15 12 30 objdata...");
  const result = parseHeader(data, 17, 3);
  assert(result.ok);
  expect(result.value).toEqual([
    { objNum: 10, offset: 0 },
    { objNum: 11, offset: 15 },
    { objNum: 12, offset: 30 },
  ]);
});

test("parseHeaderはN=0の場合に空配列を返す", () => {
  const data = enc("anything");
  const result = parseHeader(data, 0, 0);
  assert(result.ok);
  expect(result.value).toEqual([]);
});

test("parseHeaderは空のデータでエラーを返す", () => {
  const data = enc("");
  const result = parseHeader(data, 0, 1);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_HEADER_INVALID");
});

test("parseHeaderは数値でないトークンが含まれる場合にエラーを返す", () => {
  const data = enc("10 abc");
  const result = parseHeader(data, 6, 1);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_HEADER_INVALID");
  expect(result.error.message).toContain("abc");
});

test("parseHeaderは奇数個のトークンでエラーを返す", () => {
  const data = enc("10 0 11");
  const result = parseHeader(data, 7, 1);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_HEADER_INVALID");
  expect(result.error.message).toContain("odd");
});

test("parseHeaderはペア数がNと不一致の場合にエラーを返す", () => {
  const data = enc("10 0 11 15");
  const result = parseHeader(data, 10, 1);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_HEADER_INVALID");
  expect(result.error.message).toContain("2 pairs, expected 1");
});

test("parseHeaderは負のobjNumでエラーを返す", () => {
  const data = enc("-1 0");
  const result = parseHeader(data, 4, 1);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_HEADER_INVALID");
});

test("parseHeaderは負のoffsetでエラーを返す", () => {
  const data = enc("10 -5");
  const result = parseHeader(data, 5, 1);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_HEADER_INVALID");
});

// --- validateStreamDict ---

function makeDict(
  overrides: Record<string, PdfObject> = {},
): Map<string, PdfObject> {
  const defaults: Record<string, PdfObject> = {
    Type: { type: "name", value: "ObjStm" },
    First: { type: "integer", value: 24 },
    N: { type: "integer", value: 3 },
    Filter: { type: "name", value: "FlateDecode" },
  };
  return new Map(Object.entries({ ...defaults, ...overrides }));
}

test("validateStreamDictは正しい辞書から/First,/N,needsDecompressを取得できる", () => {
  const result = validateStreamDict(makeDict());
  assert(result.ok);
  expect(result.value).toEqual({ first: 24, n: 3, needsDecompress: true });
});

test("validateStreamDictは/Filter不在の辞書で未圧縮として成功する", () => {
  const dict = makeDict();
  dict.delete("Filter");
  const result = validateStreamDict(dict);
  assert(result.ok);
  expect(result.value).toEqual({ first: 24, n: 3, needsDecompress: false });
});

test("validateStreamDictは/Firstが存在しない辞書でエラーを返す", () => {
  const dict = makeDict();
  dict.delete("First");
  const result = validateStreamDict(dict);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("/First");
});

test("validateStreamDictは/Nが存在しない辞書でエラーを返す", () => {
  const dict = makeDict();
  dict.delete("N");
  const result = validateStreamDict(dict);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("/N");
});

test("validateStreamDictは/Typeが存在しない辞書でエラーを返す", () => {
  const dict = makeDict();
  dict.delete("Type");
  const result = validateStreamDict(dict);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});

test("validateStreamDictは/Typeが/ObjStmでない場合にエラーを返す", () => {
  const result = validateStreamDict(
    makeDict({ Type: { type: "name", value: "XRef" } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("/XRef");
});

test("validateStreamDictは/Filterが/FlateDecodeでない場合にエラーを返す", () => {
  const result = validateStreamDict(
    makeDict({ Filter: { type: "name", value: "LZWDecode" } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("LZWDecode");
});

test("validateStreamDictは/Filterが配列の場合にエラーを返す", () => {
  const result = validateStreamDict(
    makeDict({
      Filter: {
        type: "array",
        elements: [{ type: "name", value: "FlateDecode" }],
      },
    }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("array");
});

test("validateStreamDictは/DecodeParmsが存在する場合にエラーを返す", () => {
  const result = validateStreamDict(
    makeDict({ DecodeParms: { type: "dictionary", entries: new Map() } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("DecodeParms");
});

test("validateStreamDictは/Firstが整数でない場合にエラーを返す", () => {
  const result = validateStreamDict(
    makeDict({ First: { type: "real", value: 24.5 } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});

test("validateStreamDictは/Nが整数でない場合にエラーを返す", () => {
  const result = validateStreamDict(
    makeDict({ N: { type: "real", value: 3.5 } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});

test("validateStreamDictは/Firstが負の値の場合にエラーを返す", () => {
  const result = validateStreamDict(
    makeDict({ First: { type: "integer", value: -1 } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});

test("validateStreamDictは/Nが負の値の場合にエラーを返す", () => {
  const result = validateStreamDict(
    makeDict({ N: { type: "integer", value: -1 } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});
