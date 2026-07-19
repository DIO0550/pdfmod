import { assert, expect, test } from "vitest";
import { XRefStreamDict } from "../index";
import { makeXRefStreamDict } from "./xref-stream-dict.test.helpers";

test("parseは妥当な辞書からw/size/index/filterName/decodeParmsを取得する", () => {
  const result = XRefStreamDict.parse(makeXRefStreamDict());

  assert(result.ok);
  expect(result.value.w).toEqual([1, 2, 1]);
  expect(result.value.size).toBe(8);
  expect(result.value.index).toEqual([0, 8]);
  expect(result.value.filterName).toBe("FlateDecode");
  expect(result.value.decodeParms).toBeUndefined();
});

test("parseは/Index省略時にundefinedを返す", () => {
  const result = XRefStreamDict.parse(makeXRefStreamDict({ Index: undefined }));

  assert(result.ok);
  expect(result.value.index).toBeUndefined();
});

test("parseは/Filter省略時にfilterNameをundefinedにする", () => {
  const result = XRefStreamDict.parse(
    makeXRefStreamDict({ Filter: undefined }),
  );

  assert(result.ok);
  expect(result.value.filterName).toBeUndefined();
});

test("parseは/DecodeParmsが辞書の場合entriesをそのまま返す", () => {
  const decodeParms = new Map([
    ["Predictor", { type: "integer" as const, value: 12 }],
  ]);
  const result = XRefStreamDict.parse(
    makeXRefStreamDict({
      DecodeParms: { type: "dictionary", entries: decodeParms },
    }),
  );

  assert(result.ok);
  expect(result.value.decodeParms).toBe(decodeParms);
});

test("parseは/Typeが存在しない場合にXREF_STREAM_INVALIDを返す", () => {
  const result = XRefStreamDict.parse(makeXRefStreamDict({ Type: undefined }));

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("parseは/Typeが/XRefでない場合にXREF_STREAM_INVALIDを返す", () => {
  const result = XRefStreamDict.parse(
    makeXRefStreamDict({ Type: { type: "name", value: "ObjStm" } }),
  );

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain("/ObjStm");
});

test("parseは/Wが存在しない場合にXREF_STREAM_INVALIDを返す", () => {
  const result = XRefStreamDict.parse(makeXRefStreamDict({ W: undefined }));

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain("/W");
});

test("parseは/Wの要素数が3でない場合にXREF_STREAM_INVALIDを返す", () => {
  const result = XRefStreamDict.parse(
    makeXRefStreamDict({
      W: {
        type: "array",
        elements: [
          { type: "integer", value: 1 },
          { type: "integer", value: 2 },
        ],
      },
    }),
  );

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain("3");
});

test("parseは/Wの要素が整数でない場合にXREF_STREAM_INVALIDを返す", () => {
  const result = XRefStreamDict.parse(
    makeXRefStreamDict({
      W: {
        type: "array",
        elements: [
          { type: "real", value: 1.5 },
          { type: "integer", value: 2 },
          { type: "integer", value: 1 },
        ],
      },
    }),
  );

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("parseは/Sizeが存在しない場合にXREF_STREAM_INVALIDを返す", () => {
  const result = XRefStreamDict.parse(makeXRefStreamDict({ Size: undefined }));

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain("/Size");
});

test("parseは/Sizeが整数でない場合にXREF_STREAM_INVALIDを返す", () => {
  const result = XRefStreamDict.parse(
    makeXRefStreamDict({ Size: { type: "real", value: 8.5 } }),
  );

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("parseは/Indexが配列でない場合にXREF_STREAM_INVALIDを返す", () => {
  const result = XRefStreamDict.parse(
    makeXRefStreamDict({ Index: { type: "integer", value: 1 } }),
  );

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("parseは/Indexの要素が整数でない場合にXREF_STREAM_INVALIDを返す", () => {
  const result = XRefStreamDict.parse(
    makeXRefStreamDict({
      Index: { type: "array", elements: [{ type: "name", value: "x" }] },
    }),
  );

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
});

test("parseは/Filterが未サポートの場合にXREF_STREAM_INVALIDを返す", () => {
  const result = XRefStreamDict.parse(
    makeXRefStreamDict({ Filter: { type: "name", value: "LZWDecode" } }),
  );

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain("LZWDecode");
});

test("parseは/DecodeParmsが辞書でない場合にXREF_STREAM_INVALIDを返す", () => {
  const result = XRefStreamDict.parse(
    makeXRefStreamDict({
      DecodeParms: {
        type: "array",
        elements: [
          { type: "null" },
          { type: "dictionary", entries: new Map() },
        ],
      },
    }),
  );

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_STREAM_INVALID");
  expect(result.error.message).toContain("DecodeParms");
});
