import { expect, test } from "vitest";
import type { PdfError } from "../../errors/index";
import type { Result } from "../../utils/result/index";
import { ok } from "../../utils/result/index";
import { ByteOffset } from "../../types/byte-offset/index";
import type { PdfDictionary, PdfObject } from "../../types/pdf-types/index";
import type { ObjectResolver } from "./index";
import { ObjectParser } from "./index";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

const unwrapOk = <T>(result: Result<T, unknown>): T => {
  expect(result.ok).toBe(true);
  return (result as { ok: true; value: T }).value;
};

const unwrapErr = <E>(result: Result<unknown, E>): E => {
  expect(result.ok).toBe(false);
  return (result as { ok: false; error: E }).error;
};

test("parseIndirectObject 基本（プリミティブ body）", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n42\nendobj"),
    ByteOffset.of(0),
  );
  const obj = unwrapOk(result);
  expect(obj.objectNumber).toBe(1);
  expect(obj.generationNumber).toBe(0);
  expect(obj.body).toEqual({ type: "integer", value: 42 });
});

test("parseIndirectObject 辞書 body", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Type /Page>>\nendobj"),
    ByteOffset.of(0),
  );
  const obj = unwrapOk(result);
  expect(obj.body.type).toBe("dictionary");
  const dict = obj.body as PdfDictionary;
  expect(dict.entries.get("Type")).toEqual({ type: "name", value: "Page" });
});

test("parseIndirectObject stream（/Length 直値、CRLF）", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length 5>>\nstream\r\nhello\nendstream\nendobj"),
    ByteOffset.of(0),
  );
  const obj = unwrapOk(result);
  expect(obj.body.type).toBe("stream");
  const stream = obj.body as { type: "stream"; data: Uint8Array };
  expect(new TextDecoder().decode(stream.data)).toBe("hello");
});

test("parseIndirectObject stream（/Length 直値、LF）", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length 5>>\nstream\nhello\nendstream\nendobj"),
    ByteOffset.of(0),
  );
  const obj = unwrapOk(result);
  expect(obj.body.type).toBe("stream");
  const stream = obj.body as { type: "stream"; data: Uint8Array };
  expect(new TextDecoder().decode(stream.data)).toBe("hello");
});

test("parseIndirectObject stream（/Length 間接参照）", async () => {
  const resolver: ObjectResolver = async (): Promise<
    Result<PdfObject, PdfError>
  > => ok({ type: "integer", value: 5 });
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length 2 0 R>>\nstream\nhello\nendstream\nendobj"),
    ByteOffset.of(0),
    resolver,
  );
  const obj = unwrapOk(result);
  expect(obj.body.type).toBe("stream");
});

test("parseIndirectObject stream（resolver 未提供で /Length indirect-ref）", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length 2 0 R>>\nstream\nhello\nendstream\nendobj"),
    ByteOffset.of(0),
  );
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("parseIndirectObject stream（resolver がエラーを返す）", async () => {
  const resolver: ObjectResolver = async (): Promise<
    Result<PdfObject, PdfError>
  > => ({
    ok: false as const,
    error: {
      code: "NOT_IMPLEMENTED" as const,
      message: "test error",
    },
  });
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length 2 0 R>>\nstream\nhello\nendstream\nendobj"),
    ByteOffset.of(0),
    resolver,
  );
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("parseIndirectObject stream（resolver が integer 以外を返す）", async () => {
  const resolver: ObjectResolver = async (): Promise<
    Result<PdfObject, PdfError>
  > => ok({ type: "name", value: "not-integer" });
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length 2 0 R>>\nstream\nhello\nendstream\nendobj"),
    ByteOffset.of(0),
    resolver,
  );
  const error = unwrapErr(result);
  expect(error.code).toBe("TYPE_MISMATCH");
});

test("parseIndirectObject obj ヘッダ不正", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 foo"),
    ByteOffset.of(0),
  );
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("parseIndirectObject endobj なしで OBJECT_PARSE_UNTERMINATED", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n42"),
    ByteOffset.of(0),
  );
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_UNTERMINATED");
});

test("parseIndirectObject stream 後 CR 単独はエラー", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length 5>>\nstream\rhello\nendstream\nendobj"),
    ByteOffset.of(0),
  );
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("parseIndirectObject endstream 位置不一致はエラー", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length 3>>\nstream\nhello\nendstream\nendobj"),
    ByteOffset.of(0),
  );
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("parseIndirectObject /Length なしで stream はエラー", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<<>>\nstream\nhello\nendstream\nendobj"),
    ByteOffset.of(0),
  );
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("parseIndirectObject offset が負の場合エラー", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n42\nendobj"),
    ByteOffset.of(-1),
  );
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("parseIndirectObject /Length が負の場合エラー", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length -1>>\nstream\nhello\nendstream\nendobj"),
    ByteOffset.of(0),
  );
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("parseIndirectObject /Length がデータ範囲超過の場合エラー", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length 9999>>\nstream\nhello\nendstream\nendobj"),
    ByteOffset.of(0),
  );
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});
