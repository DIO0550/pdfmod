import { assert, expect, test } from "vitest";
import { makeDict } from "../body/object-stream-body.test.helpers";
import { ObjectStreamDict } from "./index";

test("parseは正しい辞書から/First,/N,needsDecompressを取得できる", () => {
  const result = ObjectStreamDict.parse(makeDict());
  assert(result.ok);
  expect(result.value).toEqual({ first: 24, n: 3, needsDecompress: true });
});

test("parseは/Filter不在の辞書で未圧縮として成功する", () => {
  const dict = makeDict();
  dict.delete("Filter");
  const result = ObjectStreamDict.parse(dict);
  assert(result.ok);
  expect(result.value).toEqual({ first: 24, n: 3, needsDecompress: false });
});

test("parseは/Firstが存在しない辞書でエラーを返す", () => {
  const dict = makeDict();
  dict.delete("First");
  const result = ObjectStreamDict.parse(dict);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("/First");
});

test("parseは/Nが存在しない辞書でエラーを返す", () => {
  const dict = makeDict();
  dict.delete("N");
  const result = ObjectStreamDict.parse(dict);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("/N");
});

test("parseは/Nが/Firstに対して大きすぎる場合にエラーを返す", () => {
  const result = ObjectStreamDict.parse(
    makeDict({
      First: { type: "integer", value: 4 },
      N: { type: "integer", value: 100 },
    }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("exceeds maximum");
});

test("parseは/Typeが存在しない辞書でエラーを返す", () => {
  const dict = makeDict();
  dict.delete("Type");
  const result = ObjectStreamDict.parse(dict);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});

test("parseは/Typeが/ObjStmでない場合にエラーを返す", () => {
  const result = ObjectStreamDict.parse(
    makeDict({ Type: { type: "name", value: "XRef" } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("/XRef");
});

test("parseは/Filterが/FlateDecodeでない場合にエラーを返す", () => {
  const result = ObjectStreamDict.parse(
    makeDict({ Filter: { type: "name", value: "LZWDecode" } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("LZWDecode");
});

test("parseは/Filterが配列の場合にエラーを返す", () => {
  const result = ObjectStreamDict.parse(
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

test("parseは/DecodeParmsが存在する場合にエラーを返す", () => {
  const result = ObjectStreamDict.parse(
    makeDict({ DecodeParms: { type: "dictionary", entries: new Map() } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("DecodeParms");
});

test("parseは/Extendsが存在する場合にエラーを返す", () => {
  const result = ObjectStreamDict.parse(
    makeDict({
      Extends: { type: "indirect-ref", objectNumber: 5, generationNumber: 0 },
    }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("Extends");
});

test("parseは/Firstが整数でない場合にエラーを返す", () => {
  const result = ObjectStreamDict.parse(
    makeDict({ First: { type: "real", value: 24.5 } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});

test("parseは/Nが整数でない場合にエラーを返す", () => {
  const result = ObjectStreamDict.parse(
    makeDict({ N: { type: "real", value: 3.5 } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});

test("parseは/Firstが負の値の場合にエラーを返す", () => {
  const result = ObjectStreamDict.parse(
    makeDict({ First: { type: "integer", value: -1 } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});

test("parseは/Nが負の値の場合にエラーを返す", () => {
  const result = ObjectStreamDict.parse(
    makeDict({ N: { type: "integer", value: -1 } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});
