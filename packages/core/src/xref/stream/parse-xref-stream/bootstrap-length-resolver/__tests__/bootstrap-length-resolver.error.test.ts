import { assert, expect, test } from "vitest";
import { GenerationNumber } from "../../../../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../../../../pdf/types/object-number/index";
import { createBootstrapLengthResolver } from "../index";

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

test("対象オブジェクトヘッダが見つからない場合はErrを返す", async () => {
  const data = encode("1 0 obj\n42\nendobj\n");
  const resolver = createBootstrapLengthResolver(data);

  const result = await resolver(ObjectNumber.of(5), GenerationNumber.of(0));

  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("発見した候補の本体パース自体が失敗する場合はそのエラーを返す", async () => {
  // ヘッダのみで本体・endobjを欠く、一致候補が1件だけの不完全な "5 0 obj"
  const data = encode("5 0 obj\n");
  const resolver = createBootstrapLengthResolver(data);

  const result = await resolver(ObjectNumber.of(5), GenerationNumber.of(0));

  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNTERMINATED");
});
