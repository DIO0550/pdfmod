import { assert, expect, test } from "vitest";
import { enc } from "../body/object-stream-body.test.helpers";
import { ObjectStreamHeader } from "./index";

test("parseは1つのobjNum/offsetペアを持つヘッダをパースできる", () => {
  const data = enc("10 0 << /Key /Value >>");
  const result = ObjectStreamHeader.parse(data, 4, 1);
  assert(result.ok);
  expect(result.value).toEqual([{ objNum: 10, offset: 0 }]);
});

test("parseは複数のobjNum/offsetペアを持つヘッダをパースできる", () => {
  const data = enc("10 0 11 15 12 30 objdata...");
  const result = ObjectStreamHeader.parse(data, 17, 3);
  assert(result.ok);
  expect(result.value).toEqual([
    { objNum: 10, offset: 0 },
    { objNum: 11, offset: 15 },
    { objNum: 12, offset: 30 },
  ]);
});

test("parseはN=0の場合に空配列を返す", () => {
  const data = enc("anything");
  const result = ObjectStreamHeader.parse(data, 0, 0);
  assert(result.ok);
  expect(result.value).toEqual([]);
});

test("parseはN=0でもfirstが範囲外の場合にエラーを返す", () => {
  const data = enc("10 0");
  const result = ObjectStreamHeader.parse(data, 999, 0);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_HEADER_INVALID");
});

test("parseはfirstが小数の場合にエラーを返す", () => {
  const data = enc("10 0 true");
  const result = ObjectStreamHeader.parse(data, 2.5, 1);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_HEADER_INVALID");
});

test("parseはnが負数の場合にエラーを返す", () => {
  const data = enc("10 0 true");
  const result = ObjectStreamHeader.parse(data, 4, -1);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_HEADER_INVALID");
});

test("parseは空のデータでエラーを返す", () => {
  const data = enc("");
  const result = ObjectStreamHeader.parse(data, 0, 1);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_HEADER_INVALID");
});

test("parseは数値でないトークンが含まれる場合にエラーを返す", () => {
  const data = enc("10 abc");
  const result = ObjectStreamHeader.parse(data, 6, 1);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_HEADER_INVALID");
  expect(result.error.message).toContain("Expected integer offset");
});

test("parseはトークンが足りない場合にエラーを返す", () => {
  const data = enc("10 0 11");
  const result = ObjectStreamHeader.parse(data, 7, 2);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_HEADER_INVALID");
  expect(result.error.message).toContain("Expected integer offset");
});

test("parseはNより多いペアがあっても要求分だけ読み取る", () => {
  const data = enc("10 0 11 15");
  const result = ObjectStreamHeader.parse(data, 10, 1);
  assert(result.ok);
  expect(result.value).toEqual([{ objNum: 10, offset: 0 }]);
});

test("parseは負のobjNumでエラーを返す", () => {
  const data = enc("-1 0");
  const result = ObjectStreamHeader.parse(data, 4, 1);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_HEADER_INVALID");
});

test("parseは負のoffsetでエラーを返す", () => {
  const data = enc("10 -5");
  const result = ObjectStreamHeader.parse(data, 5, 1);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_HEADER_INVALID");
});
