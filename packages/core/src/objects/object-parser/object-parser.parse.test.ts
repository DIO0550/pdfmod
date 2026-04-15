import { expect, test } from "vitest";
import type { PdfError } from "../../errors/index";
import type { Result } from "../../result/index";
import { ByteOffset } from "../../types/byte-offset/index";
import type {
  PdfDictionary,
  PdfObject,
  PdfValue,
} from "../../types/pdf-types/index";
import { ObjectParser } from "./index";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const parse = (s: string): Result<PdfObject, PdfError> =>
  ObjectParser.parse(enc(s), ByteOffset.of(0));

const unwrapOk = <T>(result: Result<T, unknown>): T => {
  expect(result.ok).toBe(true);
  return (result as { ok: true; value: T }).value;
};

const unwrapErr = <E>(result: Result<unknown, E>): E => {
  expect(result.ok).toBe(false);
  return (result as { ok: false; error: E }).error;
};

test("null リテラルをパースする", () => {
  const obj = unwrapOk(parse("null"));
  expect(obj).toEqual({ type: "null" });
});

test("true をパースする", () => {
  const obj = unwrapOk(parse("true"));
  expect(obj).toEqual({ type: "boolean", value: true });
});

test("false をパースする", () => {
  const obj = unwrapOk(parse("false"));
  expect(obj).toEqual({ type: "boolean", value: false });
});

test.each([
  ["42", 42],
  ["-7", -7],
  ["0", 0],
])("integer %s をパースする", (input, expected) => {
  const obj = unwrapOk(parse(input as string));
  expect(obj).toEqual({ type: "integer", value: expected });
});

test.each([
  ["3.14", 3.14],
  ["-0.5", -0.5],
  [".5", 0.5],
])("real %s をパースする", (input, expected) => {
  const obj = unwrapOk(parse(input as string));
  expect(obj).toEqual({ type: "real", value: expected });
});

test.each([
  ["/Type", "Type"],
  ["/A#20B", "A B"],
])("name %s をパースすると %s になる", (input, expected) => {
  const obj = unwrapOk(parse(input));
  expect(obj).toEqual({ type: "name", value: expected });
});

test("literal string をパースする", () => {
  const obj = unwrapOk(parse("(hello)"));
  expect(obj.type).toBe("string");
  const strObj = obj as { type: "string"; value: Uint8Array; encoding: string };
  expect(strObj.encoding).toBe("literal");
  expect(new TextDecoder().decode(strObj.value)).toBe("hello");
});

test("literal string エスケープをパースする", () => {
  const obj = unwrapOk(parse("(a\\nb)"));
  expect(obj.type).toBe("string");
  const strObj = obj as { type: "string"; value: Uint8Array; encoding: string };
  expect(strObj.encoding).toBe("literal");
  expect(new TextDecoder().decode(strObj.value)).toBe("a\nb");
});

test("hex string をパースする", () => {
  const obj = unwrapOk(parse("<48656C6C6F>"));
  expect(obj.type).toBe("string");
  const strObj = obj as { type: "string"; value: Uint8Array; encoding: string };
  expect(strObj.encoding).toBe("hex");
  expect(new TextDecoder().decode(strObj.value)).toBe("Hello");
});

test("hex string 奇数桁をパースする", () => {
  const obj = unwrapOk(parse("<ABC>"));
  expect(obj.type).toBe("string");
  const strObj = obj as { type: "string"; value: Uint8Array; encoding: string };
  expect(strObj.encoding).toBe("hex");
  expect(strObj.value).toEqual(new Uint8Array([0xab, 0xc0]));
});

test("hex string に不正な文字が含まれる場合エラー", () => {
  const error = unwrapErr(parse("<1G>"));
  expect(error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("literal string のオクタルエスケープが 0xff を超える場合エラー", () => {
  const error = unwrapErr(parse("(\\777)"));
  expect(error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
  expect(error.message).toContain("Invalid literal string byte value");
});

test("空配列をパースする", () => {
  const obj = unwrapOk(parse("[]"));
  expect(obj).toEqual({ type: "array", elements: [] });
});

test("要素あり配列をパースする", () => {
  const obj = unwrapOk(parse("[1 2 3]"));
  expect(obj.type).toBe("array");
  const arr = obj as { type: "array"; elements: PdfValue[] };
  expect(arr.elements).toHaveLength(3);
  expect(arr.elements[0]).toEqual({ type: "integer", value: 1 });
});

test("混合型配列をパースする", () => {
  const obj = unwrapOk(parse("[/Type true null]"));
  expect(obj.type).toBe("array");
  const arr = obj as { type: "array"; elements: PdfValue[] };
  expect(arr.elements).toHaveLength(3);
  expect(arr.elements[0]).toEqual({ type: "name", value: "Type" });
  expect(arr.elements[1]).toEqual({ type: "boolean", value: true });
  expect(arr.elements[2]).toEqual({ type: "null" });
});

test("空辞書をパースする", () => {
  const obj = unwrapOk(parse("<<>>"));
  expect(obj.type).toBe("dictionary");
  const dict = obj as PdfDictionary;
  expect(dict.entries.size).toBe(0);
});

test("エントリあり辞書をパースする", () => {
  const obj = unwrapOk(parse("<</Type /Page>>"));
  expect(obj.type).toBe("dictionary");
  const dict = obj as PdfDictionary;
  expect(dict.entries.get("Type")).toEqual({ type: "name", value: "Page" });
});

test("複数エントリ辞書をパースする", () => {
  const obj = unwrapOk(parse("<</Count 3 /Kids [1 0 R]>>"));
  expect(obj.type).toBe("dictionary");
  const dict = obj as PdfDictionary;
  expect(dict.entries.get("Count")).toEqual({ type: "integer", value: 3 });
  const kids = dict.entries.get("Kids") as {
    type: "array";
    elements: PdfValue[];
  };
  expect(kids.elements).toHaveLength(1);
  expect(kids.elements[0]).toEqual({
    type: "indirect-ref",
    objectNumber: 1,
    generationNumber: 0,
  });
});

test("ネスト配列をパースする", () => {
  const obj = unwrapOk(parse("[[1] [2]]"));
  expect(obj.type).toBe("array");
  const arr = obj as { type: "array"; elements: PdfValue[] };
  expect(arr.elements).toHaveLength(2);
});

test("ネスト辞書をパースする", () => {
  const obj = unwrapOk(parse("<</A <</B 1>>>>"));
  expect(obj.type).toBe("dictionary");
  const dict = obj as PdfDictionary;
  const inner = dict.entries.get("A") as PdfDictionary;
  expect(inner.type).toBe("dictionary");
  expect(inner.entries.get("B")).toEqual({ type: "integer", value: 1 });
});

test("101段ネスト配列で NESTING_TOO_DEEP エラーが返る", () => {
  const input = "[".repeat(101) + "]".repeat(101);
  const error = unwrapErr(parse(input));
  expect(error.code).toBe("NESTING_TOO_DEEP");
});

test("閉じ括弧なし配列で OBJECT_PARSE_UNTERMINATED エラーが返る", () => {
  const error = unwrapErr(parse("[1 2"));
  expect(error.code).toBe("OBJECT_PARSE_UNTERMINATED");
});

test("辞書キーが Name でない場合 OBJECT_PARSE_UNEXPECTED_TOKEN エラーが返る", () => {
  const error = unwrapErr(parse("<< 1 2 >>"));
  expect(error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("閉じ括弧なし辞書で OBJECT_PARSE_UNTERMINATED エラーが返る", () => {
  const error = unwrapErr(parse("<</A 1"));
  expect(error.code).toBe("OBJECT_PARSE_UNTERMINATED");
});

test("indirect-ref をパースする", () => {
  const obj = unwrapOk(parse("5 0 R"));
  expect(obj).toEqual({
    type: "indirect-ref",
    objectNumber: 5,
    generationNumber: 0,
  });
});

test("Integer の後に非 Integer が続く場合は integer を返す", () => {
  const obj = unwrapOk(parse("5 (str)"));
  expect(obj).toEqual({ type: "integer", value: 5 });
});

test("Integer Integer 非R の場合は integer を返す", () => {
  const data = enc("5 0 obj");
  const result = ObjectParser.parse(data, ByteOffset.of(0));
  const obj = unwrapOk(result);
  expect(obj).toEqual({ type: "integer", value: 5 });
});

test("配列内で indirect-ref と integer が正しく区別される", () => {
  const obj = unwrapOk(parse("[5 0 R 10]"));
  expect(obj.type).toBe("array");
  const arr = obj as { type: "array"; elements: PdfValue[] };
  expect(arr.elements).toHaveLength(2);
  expect(arr.elements[0]).toEqual({
    type: "indirect-ref",
    objectNumber: 5,
    generationNumber: 0,
  });
  expect(arr.elements[1]).toEqual({ type: "integer", value: 10 });
});

test("NaN 数値トークン . で OBJECT_PARSE_UNEXPECTED_TOKEN が返る", () => {
  const error = unwrapErr(parse("."));
  expect(error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("NaN 数値トークン + で OBJECT_PARSE_UNEXPECTED_TOKEN が返る", () => {
  const error = unwrapErr(parse("+"));
  expect(error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("parse() で辞書直後の stream を検出する（LF）", () => {
  const input = "<</Length 5>>\nstream\nhello\nendstream";
  const obj = unwrapOk(parse(input));
  expect(obj.type).toBe("stream");
  const stream = obj as {
    type: "stream";
    dictionary: PdfDictionary;
    data: Uint8Array;
  };
  expect(new TextDecoder().decode(stream.data)).toBe("hello");
});

test("parse() で辞書直後の stream を検出する（CRLF）", () => {
  const input = "<</Length 5>>\nstream\r\nhello\nendstream";
  const obj = unwrapOk(parse(input));
  expect(obj.type).toBe("stream");
  const stream = obj as {
    type: "stream";
    dictionary: PdfDictionary;
    data: Uint8Array;
  };
  expect(new TextDecoder().decode(stream.data)).toBe("hello");
});

test("parse() で /Length が indirect-ref の場合 OBJECT_PARSE_STREAM_LENGTH が返る", () => {
  const input = "<</Length 5 0 R>>\nstream\nhello\nendstream";
  const error = unwrapErr(parse(input));
  expect(error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("parse() で stream 後 CR 単独はエラー", () => {
  const input = "<</Length 5>>\nstream\rhello\nendstream";
  const error = unwrapErr(parse(input));
  expect(error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("offset が負の場合 OBJECT_PARSE_UNEXPECTED_TOKEN が返る", () => {
  const error = unwrapErr(ObjectParser.parse(enc("null"), ByteOffset.of(-1)));
  expect(error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("offset が data.length 以上の場合 OBJECT_PARSE_UNEXPECTED_TOKEN が返る", () => {
  const data = enc("null");
  const error = unwrapErr(ObjectParser.parse(data, ByteOffset.of(data.length)));
  expect(error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("offset を指定してパースできる", () => {
  const data = enc("   42");
  const obj = unwrapOk(ObjectParser.parse(data, ByteOffset.of(3)));
  expect(obj).toEqual({ type: "integer", value: 42 });
});

test("予期しないトークンで OBJECT_PARSE_UNEXPECTED_TOKEN が返る", () => {
  const error = unwrapErr(parse("endobj"));
  expect(error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});
