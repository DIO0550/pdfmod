import { assert, expect, test } from "vitest";
import { GenerationNumber } from "../../../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../../../pdf/types/object-number/index";
import { resolveLocalLength } from "../index";

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

test("参照先オブジェクトがデータ内に存在しない場合にエラーを返す", async () => {
  const data = encode("1 0 obj\n42\nendobj\n");

  const result = await resolveLocalLength(
    data,
    ObjectNumber.of(99),
    GenerationNumber.of(0),
  );

  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
  expect(result.error.message).toContain("Cannot locate object");
  expect(result.error.message).toContain("/Length resolution");
});

test("参照先オブジェクトのパースに失敗する場合にエラーを返す", async () => {
  const data = encode("10 0 obj\n<<<\nendobj\n");

  const result = await resolveLocalLength(
    data,
    ObjectNumber.of(10),
    GenerationNumber.of(0),
  );

  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
  expect(result.error.message).toContain("parse failed");
});

test("空の Uint8Array でスキャンした場合にエラーを返す", async () => {
  const data = new Uint8Array(0);

  const result = await resolveLocalLength(
    data,
    ObjectNumber.of(1),
    GenerationNumber.of(0),
  );

  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
  expect(result.error.message).toContain("Cannot locate object");
  expect(result.error.message).toContain("/Length resolution");
});

test("類似パターンがあるが token boundary で区切られていない場合にマッチしない", async () => {
  const data = encode("150 0 obj\n42\nendobj\n");

  const result = await resolveLocalLength(
    data,
    ObjectNumber.of(50),
    GenerationNumber.of(0),
  );

  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("コメント内の N G obj パターンにマッチしない", async () => {
  const data = encode("% 5 0 obj\n");

  const result = await resolveLocalLength(
    data,
    ObjectNumber.of(5),
    GenerationNumber.of(0),
  );

  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
  expect(result.error.message).toContain("Cannot locate object");
  expect(result.error.message).toContain("/Length resolution");
});
