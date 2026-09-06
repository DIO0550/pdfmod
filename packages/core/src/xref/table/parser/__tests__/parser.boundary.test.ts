import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../../pdf/types/byte-offset/index";
import { GenerationNumber } from "../../../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../../../pdf/types/object-number/index";
import { parseXRefTable } from "../index";

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
  const xrefData = "xref\n1 1\n0000000100 00000 n\r\ntrailer";
  const data = encode(prefix + xrefData);
  const result = parseXRefTable(data, ByteOffset.of(prefix.length));
  assert(result.ok);
  expect(result.value.xref.entries.get(ObjectNumber.of(1))).toEqual({
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

test("0 番エントリは読み進めたうえで表に登録されない（ISO 32000-1 §7.5.4）", () => {
  const data = encode(
    "xref\n0 3\n0000000000 65535 f \n0000000017 00000 n \n0000000081 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\n",
  );
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(result.ok);
  expect(result.value.xref.entries.get(ObjectNumber.of(0))).toBeUndefined();
  expect(result.value.xref.entries.get(ObjectNumber.of(1))).toEqual({
    type: 1,
    offset: ByteOffset.of(17),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.xref.entries.get(ObjectNumber.of(2))).toEqual({
    type: 1,
    offset: ByteOffset.of(81),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.xref.size).toBe(3);
  expect(result.value.xref.entries.size).toBe(2);
});

test("不正なステータスフラグを持つ 0 番エントリは従来どおりエラーになる", () => {
  const data = encode(
    "xref\n0 1\n0000000000 65535 x \ntrailer\n<< /Size 1 >>\n",
  );
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("0 番だけのサブセクションでも trailer まで到達し entries が空になる", () => {
  const data = encode(
    "xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 >>\n",
  );
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(result.ok);
  expect(result.value.xref.entries.size).toBe(0);
  expect(result.value.xref.size).toBe(1);
});

test("複数サブセクションでも各 0 番だけがスキップされ正番号は落ちない", () => {
  const data = encode(
    "xref\n0 2\n0000000000 65535 f \n0000000017 00000 n \n0 2\n0000000000 65535 f \n0000000099 00000 n \ntrailer\n<< /Size 2 >>\n",
  );
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(result.ok);
  expect(result.value.xref.entries.get(ObjectNumber.of(0))).toBeUndefined();
  // 同一キーは後勝ちのため、後続サブセクションの 1 番が残る
  expect(result.value.xref.entries.get(ObjectNumber.of(1))).toEqual({
    type: 1,
    offset: ByteOffset.of(99),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.xref.entries.size).toBe(1);
});
