import { assert, expect, test } from "vitest";
import { GenerationNumber } from "../../../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../../../pdf/types/object-number/index";
import { resolveLocalLength } from "../index";

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

test("直後に配置された integer オブジェクトを解決する", async () => {
  const data = concatBytes([
    encode("1 0 obj\n<< /Length 10 0 R >>\nendobj\n"),
    encode("10 0 obj\n42\nendobj\n"),
  ]);

  const result = await resolveLocalLength(
    data,
    ObjectNumber.of(10),
    GenerationNumber.of(0),
  );

  assert(result.ok);
  expect(result.value).toEqual({ type: "integer", value: 42 });
});

test("直前に配置された integer オブジェクトを解決する", async () => {
  const data = concatBytes([
    encode("3 0 obj\n100\nendobj\n"),
    encode("1 0 obj\n<< /Length 3 0 R >>\nendobj\n"),
  ]);

  const result = await resolveLocalLength(
    data,
    ObjectNumber.of(3),
    GenerationNumber.of(0),
  );

  assert(result.ok);
  expect(result.value).toEqual({ type: "integer", value: 100 });
});

test("generation number 0 以外のオブジェクトを解決する", async () => {
  const data = encode("5 1 obj\n7\nendobj\n");

  const result = await resolveLocalLength(
    data,
    ObjectNumber.of(5),
    GenerationNumber.of(1),
  );

  assert(result.ok);
  expect(result.value).toEqual({ type: "integer", value: 7 });
});

test("データ先頭にあるオブジェクトを解決する", async () => {
  const data = encode("1 0 obj\n256\nendobj\n");

  const result = await resolveLocalLength(
    data,
    ObjectNumber.of(1),
    GenerationNumber.of(0),
  );

  assert(result.ok);
  expect(result.value).toEqual({ type: "integer", value: 256 });
});

test("データ末尾ぎりぎりにオブジェクトヘッダがある場合", async () => {
  const data = encode("2 0 obj\n50\nendobj");

  const result = await resolveLocalLength(
    data,
    ObjectNumber.of(2),
    GenerationNumber.of(0),
  );

  assert(result.ok);
  expect(result.value).toEqual({ type: "integer", value: 50 });
});

test("objNum=1, genNum=0 の最小の有効なオブジェクト番号を解決する", async () => {
  const data = encode("1 0 obj\n1\nendobj\n");

  const result = await resolveLocalLength(
    data,
    ObjectNumber.of(1),
    GenerationNumber.of(0),
  );

  assert(result.ok);
  expect(result.value).toEqual({ type: "integer", value: 1 });
});

test("0 0 obj は ISO 32000-1 §7.3.10 違反のため解決できない", async () => {
  const data = encode("0 0 obj\n1\nendobj\n");

  const result = await resolveLocalLength(
    data,
    ObjectNumber.of(0),
    GenerationNumber.of(0),
  );

  assert(!result.ok);
});

test("同一 objNum/genNum のオブジェクトが複数存在する場合は後方（新しい方）を優先する", async () => {
  const data = concatBytes([
    encode("5 0 obj\n42\nendobj\n"),
    encode("5 0 obj\n99\nendobj\n"),
  ]);

  const result = await resolveLocalLength(
    data,
    ObjectNumber.of(5),
    GenerationNumber.of(0),
  );

  assert(result.ok);
  expect(result.value).toEqual({ type: "integer", value: 99 });
});

test("偽候補の parse 失敗時に次の候補を試す", async () => {
  const data = concatBytes([
    encode("5 0 obj\n<<<\nendobj\n"),
    encode("5 0 obj\n42\nendobj\n"),
  ]);

  const result = await resolveLocalLength(
    data,
    ObjectNumber.of(5),
    GenerationNumber.of(0),
  );

  assert(result.ok);
  expect(result.value).toEqual({ type: "integer", value: 42 });
});
