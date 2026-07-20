import { assert, expect, test } from "vitest";
import { GenerationNumber } from "../../../../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../../../../pdf/types/object-number/index";
import { createBootstrapLengthResolver } from "../index";

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

test("単一ヒットで整数値を解決する", async () => {
  const data = encode("5 0 obj\n42\nendobj\n");
  const resolver = createBootstrapLengthResolver(data);

  const result = await resolver(ObjectNumber.of(5), GenerationNumber.of(0));

  assert(result.ok);
  expect(result.value).toEqual({ type: "integer", value: 42 });
});

test("複数ヒット時は末尾優先で解決する", async () => {
  const data = concatBytes([
    encode("5 0 obj\n1\nendobj\n"),
    encode("5 0 obj\n99\nendobj\n"),
  ]);
  const resolver = createBootstrapLengthResolver(data);

  const result = await resolver(ObjectNumber.of(5), GenerationNumber.of(0));

  assert(result.ok);
  expect(result.value).toEqual({ type: "integer", value: 99 });
});

test("末尾候補のパースが失敗する場合は前候補へフォールバックする", async () => {
  const data = concatBytes([
    encode("5 0 obj\n1\nendobj\n"),
    // 末尾候補: ヘッダのみで本体・endobjを欠く不完全な"5 0 obj"
    encode("5 0 obj\n"),
  ]);
  const resolver = createBootstrapLengthResolver(data);

  const result = await resolver(ObjectNumber.of(5), GenerationNumber.of(0));

  assert(result.ok);
  expect(result.value).toEqual({ type: "integer", value: 1 });
});

test("objectNumber=0のオブジェクトを解決する", async () => {
  const data = encode("0 0 obj\n7\nendobj\n");
  const resolver = createBootstrapLengthResolver(data);

  const result = await resolver(ObjectNumber.of(0), GenerationNumber.of(0));

  assert(result.ok);
  expect(result.value).toEqual({ type: "integer", value: 7 });
});

test("objectNumberが仕様上の上限に近い大きな値のオブジェクトを解決する", async () => {
  const LARGE_OBJECT_NUMBER = 999999999999;
  const data = encode(`${LARGE_OBJECT_NUMBER} 0 obj\n123\nendobj\n`);
  const resolver = createBootstrapLengthResolver(data);

  const result = await resolver(
    ObjectNumber.of(LARGE_OBJECT_NUMBER),
    GenerationNumber.of(0),
  );

  assert(result.ok);
  expect(result.value).toEqual({ type: "integer", value: 123 });
});

test("解決先の値が整数以外でもOkでそのまま返す（型検証はStreamObject.resolveLengthに委譲）", async () => {
  const data = encode("5 0 obj\n<< /Foo /Bar >>\nendobj\n");
  const resolver = createBootstrapLengthResolver(data);

  const result = await resolver(ObjectNumber.of(5), GenerationNumber.of(0));

  assert(result.ok);
  expect(result.value.type).toBe("dictionary");
});
