import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../types/byte-offset/index";
import { GenerationNumber } from "../../../types/generation-number/index";
import { ObjectNumber } from "../../../types/object-number/index";
import { parseXRefTable } from "./index";

const encoder = new TextEncoder();

function encode(str: string): Uint8Array {
  return encoder.encode(str);
}

test.each([
  { offset: -1, label: "負数" },
  { offset: 9999, label: "data.length 以上" },
])("offset が $label のとき Err(XREF_TABLE_INVALID) を返す", ({ offset }) => {
  const data = encode("xref\n0 1\n0000000000 00000 n\r\ntrailer");
  const result = parseXRefTable(data, ByteOffset.of(offset));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("非0 offset からprefixの後にあるxrefテーブルを正常にパースする", () => {
  const prefix = "DUMMY_PREFIX\n";
  const xrefData = "xref\n0 1\n0000000100 00000 n\r\ntrailer";
  const data = encode(prefix + xrefData);
  const result = parseXRefTable(data, ByteOffset.of(prefix.length));
  assert(result.ok);
  expect(result.value.xref.entries.get(ObjectNumber.of(0))).toEqual({
    type: 1,
    offset: ByteOffset.of(100),
    generationNumber: GenerationNumber.of(0),
  });
});

test("xrefキーワード途中でデータが終了する場合 Err を返す", () => {
  const data = encode("xre");
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});
