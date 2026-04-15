import { assert, expect, test } from "vitest";
import type { PdfDictionary, PdfValue } from "../../../types/pdf-types/index";
import { StreamObject } from "./index";

const dictOf = (entries: [string, PdfValue][]): PdfDictionary => ({
  type: "dictionary",
  entries: new Map(entries),
});

test("/Length が integer 直値のとき kind='direct' で値を返す", () => {
  const dict = dictOf([["Length", { type: "integer", value: 42 }]]);
  const result = StreamObject.readLength(dict, 0, 0);
  assert(result.ok);
  expect(result.value).toEqual({ kind: "direct", value: 42 });
});

test("/Length が indirect-ref のとき kind='indirect' で参照を返す", () => {
  const dict = dictOf([
    ["Length", { type: "indirect-ref", objectNumber: 5, generationNumber: 0 }],
  ]);
  const result = StreamObject.readLength(dict, 0, 0);
  assert(result.ok);
  expect(result.value.kind).toBe("indirect");
});

test("/Length エントリが missing でエラー", () => {
  const dict = dictOf([]);
  const result = StreamObject.readLength(dict, 0, 0);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("/Length が不正型（string）でエラー", () => {
  const dict = dictOf([["Length", { type: "name", value: "notAnInteger" }]]);
  const result = StreamObject.readLength(dict, 0, 0);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});
