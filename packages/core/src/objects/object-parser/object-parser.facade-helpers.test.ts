import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../pdf/types/byte-offset/index";
import { ObjectParser } from "./index";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

test("parseHeader 経由: 不正 objectNumber（-1 0 obj）でエラー", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("-1 0 obj\n42\nendobj"),
    ByteOffset.of(0),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("parseHeader 経由: 不正 generationNumber（1 -1 obj）でエラー", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 -1 obj\n42\nendobj"),
    ByteOffset.of(0),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("validateEndobj 経由: 非 stream endobj 誤トークンで OBJECT_PARSE_UNEXPECTED_TOKEN", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n42\nfoo"),
    ByteOffset.of(0),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("validateEndobjAt 経由: endstream 後の endobj 欠落（EOF）で OBJECT_PARSE_UNTERMINATED", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length 5>>\nstream\nhello\nendstream\n"),
    ByteOffset.of(0),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNTERMINATED");
});

test("validateEndobjAt 経由: endstream 後の誤トークンで OBJECT_PARSE_UNEXPECTED_TOKEN", async () => {
  const result = await ObjectParser.parseIndirectObject(
    enc("1 0 obj\n<</Length 5>>\nstream\nhello\nendstream\nfoo"),
    ByteOffset.of(0),
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});
