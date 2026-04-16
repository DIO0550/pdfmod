import { assert, expect, test } from "vitest";
import type { PdfDictionary } from "../../../types/pdf-types/index";
import { StreamObject } from "./index";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const emptyDict: PdfDictionary = { type: "dictionary", entries: new Map() };

test("LF 改行後のストリームデータが正しく切り出される", () => {
  const data = enc("\nhello\nendstream");
  const result = StreamObject.extract(data, 0, 0, emptyDict, 5);
  assert(result.ok);
  expect(new TextDecoder().decode(result.value.object.data)).toBe("hello");
});

test("CRLF 改行後のストリームデータが正しく切り出される", () => {
  const data = enc("\r\nhello\nendstream");
  const result = StreamObject.extract(data, 0, 0, emptyDict, 5);
  assert(result.ok);
  expect(new TextDecoder().decode(result.value.object.data)).toBe("hello");
});

test("CR 単独はエラー", () => {
  const data = enc("\rhello\nendstream");
  const result = StreamObject.extract(data, 0, 0, emptyDict, 5);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("length が負でエラー", () => {
  const data = enc("\nhello\nendstream");
  const result = StreamObject.extract(data, 0, 0, emptyDict, -1);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("データ範囲超過でエラー", () => {
  const data = enc("\nhello\nendstream");
  const result = StreamObject.extract(data, 0, 0, emptyDict, 9999);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("endstream キーワード不一致でエラー", () => {
  const data = enc("\nhello\nendstrea");
  const result = StreamObject.extract(data, 0, 0, emptyDict, 5);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("endstream の後続が識別子文字（例: endstreaming）でエラー", () => {
  const data = enc("\nhello\nendstreaming");
  const result = StreamObject.extract(data, 0, 0, emptyDict, 5);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("endstream の後続が whitespace なら正常に切り出される", () => {
  const data = enc("\nhello\nendstream ");
  const result = StreamObject.extract(data, 0, 0, emptyDict, 5);
  assert(result.ok);
  expect(new TextDecoder().decode(result.value.object.data)).toBe("hello");
});

test("endstream の後続が EOF なら正常に切り出される", () => {
  const data = enc("\nhello\nendstream");
  const result = StreamObject.extract(data, 0, 0, emptyDict, 5);
  assert(result.ok);
  expect(new TextDecoder().decode(result.value.object.data)).toBe("hello");
});
