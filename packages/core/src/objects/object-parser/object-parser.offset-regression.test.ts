import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../pdf/types/byte-offset/index";
import { ObjectParser } from "./index";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

test("parseIndirectObject: 先頭ダミーバイト付き非 stream（offset > 0）で正常系", async () => {
  const data = enc("xxx1 0 obj\n42\nendobj");
  const result = await ObjectParser.parseIndirectObject(data, ByteOffset.of(3));
  assert(result.ok);
  expect(result.value.body).toEqual({ type: "integer", value: 42 });
});

test("parseIndirectObject: 先頭ダミーバイト付き stream（offset > 0）で正常系", async () => {
  const data = enc(
    "xxx1 0 obj\n<</Length 5>>\nstream\nhello\nendstream\nendobj",
  );
  const result = await ObjectParser.parseIndirectObject(data, ByteOffset.of(3));
  assert(result.ok);
  expect(result.value.body.type).toBe("stream");
});

test("parseIndirectObject: 先頭ダミーバイト付き stream で endobj 欠落時の error.offset が絶対位置", async () => {
  const data = enc("xxx1 0 obj\n<</Length 5>>\nstream\nhello\nendstream\n");
  const result = await ObjectParser.parseIndirectObject(data, ByteOffset.of(3));
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNTERMINATED");
});

test("parseIndirectObject: 負数 offset は OBJECT_PARSE_UNEXPECTED_TOKEN", async () => {
  const data = enc("1 0 obj\n42\nendobj");
  const result = await ObjectParser.parseIndirectObject(
    data,
    ByteOffset.of(-1),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("parseIndirectObject: 非 safe integer offset は OBJECT_PARSE_UNEXPECTED_TOKEN", async () => {
  const data = enc("1 0 obj\n42\nendobj");
  const result = await ObjectParser.parseIndirectObject(
    data,
    ByteOffset.of(1.5),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("parseIndirectObject: offset === data.length は OBJECT_PARSE_UNEXPECTED_TOKEN", async () => {
  const data = enc("1 0 obj\n42\nendobj");
  const result = await ObjectParser.parseIndirectObject(
    data,
    ByteOffset.of(data.length),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("parse: 先頭ダミーバイト付きエラー時の offset 値", () => {
  const data = enc("xxxendobj");
  const result = ObjectParser.parse(data, ByteOffset.of(3));
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("parse: 負数 offset は OBJECT_PARSE_UNEXPECTED_TOKEN", () => {
  const data = enc("null");
  const result = ObjectParser.parse(data, ByteOffset.of(-1));
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("parse: 非 safe integer offset は OBJECT_PARSE_UNEXPECTED_TOKEN", () => {
  const data = enc("null");
  const result = ObjectParser.parse(data, ByteOffset.of(1.5));
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("parse: offset === data.length は OBJECT_PARSE_UNEXPECTED_TOKEN", () => {
  const data = enc("null");
  const result = ObjectParser.parse(data, ByteOffset.of(data.length));
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});
