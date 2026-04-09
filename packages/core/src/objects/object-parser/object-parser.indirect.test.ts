import { expect, test } from "vitest";
import type { PdfError } from "../../errors/index";
import type { Result } from "../../result/index";
import type { PdfDictionary } from "../../types/pdf-types/index";
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
    0,
  );
  const obj = unwrapOk(result);
  expect(obj.objectNumber).toBe(1);
  expect(obj.generationNumber).toBe(0);
  expect(obj.value).toEqual({ type: "integer", value: 42 });
});

test("parseIndirectObject 辞書 body", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Type /Page>>\nendobj"),
    0,
  );
  const obj = unwrapOk(result);
  expect(obj.value.type).toBe("dictionary");
  const dict = obj.value as PdfDictionary;
  expect(dict.entries.get("Type")).toEqual({ type: "name", value: "Page" });
});

test("parseIndirectObject stream（/Length 直値、CRLF）", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length 5>>\nstream\r\nhello\nendstream\nendobj"),
    0,
  );
  const obj = unwrapOk(result);
  expect(obj.value.type).toBe("stream");
  const stream = obj.value as { type: "stream"; data: Uint8Array };
  expect(new TextDecoder().decode(stream.data)).toBe("hello");
});

test("parseIndirectObject stream（/Length 直値、LF）", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length 5>>\nstream\nhello\nendstream\nendobj"),
    0,
  );
  const obj = unwrapOk(result);
  expect(obj.value.type).toBe("stream");
  const stream = obj.value as { type: "stream"; data: Uint8Array };
  expect(new TextDecoder().decode(stream.data)).toBe("hello");
});

test("parseIndirectObject stream（/Length 間接参照）", async () => {
  const resolveLength = async (): Promise<Result<number, PdfError>> => ({
    ok: true as const,
    value: 5,
  });
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length 2 0 R>>\nstream\nhello\nendstream\nendobj"),
    0,
    resolveLength,
  );
  const obj = unwrapOk(result);
  expect(obj.value.type).toBe("stream");
});

test("parseIndirectObject stream（resolveLength 未提供で /Length indirect-ref）", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length 2 0 R>>\nstream\nhello\nendstream\nendobj"),
    0,
  );
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("parseIndirectObject stream（resolveLength がエラーを返す）", async () => {
  const resolveLength = async (): Promise<Result<number, PdfError>> => ({
    ok: false as const,
    error: {
      code: "NOT_IMPLEMENTED" as const,
      message: "test error",
    },
  });
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length 2 0 R>>\nstream\nhello\nendstream\nendobj"),
    0,
    resolveLength,
  );
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("parseIndirectObject obj ヘッダ不正", async () => {
  const result = await ObjectParser.parseIndirectObject(enc("1 0 foo"), 0);
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("parseIndirectObject endobj なしで OBJECT_PARSE_UNTERMINATED", async () => {
  const result = await ObjectParser.parseIndirectObject(enc("1 0 obj\n42"), 0);
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_UNTERMINATED");
});

test("parseIndirectObject stream 後 CR 単独はエラー", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length 5>>\nstream\rhello\nendstream\nendobj"),
    0,
  );
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("parseIndirectObject endstream 位置不一致はエラー", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length 3>>\nstream\nhello\nendstream\nendobj"),
    0,
  );
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("parseIndirectObject /Length なしで stream はエラー", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<<>>\nstream\nhello\nendstream\nendobj"),
    0,
  );
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("parseIndirectObject offset が負の場合エラー", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n42\nendobj"),
    -1,
  );
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("parseIndirectObject /Length が負の場合エラー", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length -1>>\nstream\nhello\nendstream\nendobj"),
    0,
  );
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("parseIndirectObject /Length がデータ範囲超過の場合エラー", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length 9999>>\nstream\nhello\nendstream\nendobj"),
    0,
  );
  const error = unwrapErr(result);
  expect(error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});
