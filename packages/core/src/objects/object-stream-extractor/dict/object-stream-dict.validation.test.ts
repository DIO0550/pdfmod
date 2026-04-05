import { assert, expect, test } from "vitest";
import { makeDict } from "../body/object-stream-body.test.helpers";
import { ObjectStreamDict } from "./index";

test("validateは正しい辞書から/First,/N,needsDecompressを取得できる", () => {
  const result = ObjectStreamDict.validate(makeDict());
  assert(result.ok);
  expect(result.value).toEqual({ first: 24, n: 3, needsDecompress: true });
});

test("validateは/Filter不在の辞書で未圧縮として成功する", () => {
  const dict = makeDict();
  dict.delete("Filter");
  const result = ObjectStreamDict.validate(dict);
  assert(result.ok);
  expect(result.value).toEqual({ first: 24, n: 3, needsDecompress: false });
});

test("validateは/Firstが存在しない辞書でエラーを返す", () => {
  const dict = makeDict();
  dict.delete("First");
  const result = ObjectStreamDict.validate(dict);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("/First");
});

test("validateは/Nが存在しない辞書でエラーを返す", () => {
  const dict = makeDict();
  dict.delete("N");
  const result = ObjectStreamDict.validate(dict);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("/N");
});

test("validateは/Nが/Firstに対して大きすぎる場合にエラーを返す", () => {
  const result = ObjectStreamDict.validate(
    makeDict({
      First: { type: "integer", value: 4 },
      N: { type: "integer", value: 100 },
    }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("exceeds maximum");
});

test("validateは/Typeが存在しない辞書でエラーを返す", () => {
  const dict = makeDict();
  dict.delete("Type");
  const result = ObjectStreamDict.validate(dict);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});

test("validateは/Typeが/ObjStmでない場合にエラーを返す", () => {
  const result = ObjectStreamDict.validate(
    makeDict({ Type: { type: "name", value: "XRef" } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("/XRef");
});

test("validateは/Filterが/FlateDecodeでない場合にエラーを返す", () => {
  const result = ObjectStreamDict.validate(
    makeDict({ Filter: { type: "name", value: "LZWDecode" } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("LZWDecode");
});

test("validateは/Filterが配列の場合にエラーを返す", () => {
  const result = ObjectStreamDict.validate(
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

test("validateは/DecodeParmsが存在する場合にエラーを返す", () => {
  const result = ObjectStreamDict.validate(
    makeDict({ DecodeParms: { type: "dictionary", entries: new Map() } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("DecodeParms");
});

test("validateは/Extendsが存在する場合にエラーを返す", () => {
  const result = ObjectStreamDict.validate(
    makeDict({
      Extends: { type: "indirect-ref", objectNumber: 5, generationNumber: 0 },
    }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("Extends");
});

test("validateは/Firstが整数でない場合にエラーを返す", () => {
  const result = ObjectStreamDict.validate(
    makeDict({ First: { type: "real", value: 24.5 } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});

test("validateは/Nが整数でない場合にエラーを返す", () => {
  const result = ObjectStreamDict.validate(
    makeDict({ N: { type: "real", value: 3.5 } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});

test("validateは/Firstが負の値の場合にエラーを返す", () => {
  const result = ObjectStreamDict.validate(
    makeDict({ First: { type: "integer", value: -1 } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});

test("validateは/Nが負の値の場合にエラーを返す", () => {
  const result = ObjectStreamDict.validate(
    makeDict({ N: { type: "integer", value: -1 } }),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
});
