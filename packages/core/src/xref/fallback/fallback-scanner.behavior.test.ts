import { assert, expect, test } from "vitest";
import {
  ByteOffset,
  GenerationNumber,
  ObjectNumber,
} from "../../pdf/types/index";
import { scanFallback } from "./fallback-scanner";

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

test("`1 0 obj` 1 件含むデータから XRefTable を構築する (FB-001)", () => {
  const data = encode("1 0 obj\n<<>>\nendobj\n");
  const result = scanFallback(data);
  assert(result.ok);
  const { xrefTable, trailer, warnings } = result.value;
  expect(xrefTable.entries.size).toBe(1);
  expect(xrefTable.size).toBe(2);
  expect(xrefTable.entries.get(ObjectNumber.of(1))).toEqual({
    type: 1,
    offset: ByteOffset.of(0),
    generationNumber: GenerationNumber.of(0),
  });
  expect(trailer).toBeUndefined();
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("XREF_REBUILD");
});

test("`obj` 皆無のデータでは空 XRefTable と XREF_REBUILD warning 1 件を返す", () => {
  const data = encode("%PDF-1.7\n%%EOF\n");
  const result = scanFallback(data);
  assert(result.ok);
  const { xrefTable, warnings } = result.value;
  expect(xrefTable.entries.size).toBe(0);
  expect(xrefTable.size).toBe(0);
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("XREF_REBUILD");
});

test.each([
  ["empty", new Uint8Array(0)],
  ["1KB 未満", new Uint8Array(512)],
])("境界条件 %s でもエラーにならず空 XRefTable を返す", (_label, data) => {
  const result = scanFallback(data);
  assert(result.ok);
  expect(result.value.xrefTable.entries.size).toBe(0);
  expect(result.value.xrefTable.size).toBe(0);
  expect(result.value.warnings).toHaveLength(1);
  expect(result.value.warnings[0].code).toBe("XREF_REBUILD");
});

test("同一オブジェクト番号の重複は末尾優先で採用される (FB-003)", () => {
  const body = "1 0 obj\n<<>>\nendobj\n1 0 obj\n<</Late true>>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.ok);
  const entry = result.value.xrefTable.entries.get(ObjectNumber.of(1));
  const lastOffset = body.lastIndexOf("1 0 obj");
  expect(entry).toEqual({
    type: 1,
    offset: ByteOffset.of(lastOffset),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.xrefTable.entries.size).toBe(1);
  expect(result.value.xrefTable.size).toBe(2);
});

test("XRefTable.size は max(objectNumber) + 1 で計算される", () => {
  const body = "1 0 obj\nx\nendobj\n5 0 obj\nx\nendobj\n3 0 obj\nx\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.ok);
  expect(result.value.xrefTable.size).toBe(6);
  expect(result.value.xrefTable.entries.size).toBe(3);
});

test("skip 候補があっても warnings は XREF_REBUILD 1 件のみで recovery に集約される", () => {
  const overflow = "9".repeat(21);
  const body =
    "1 0 obj\n<<>>\nendobj\n" +
    `${overflow} 0 obj\n<<>>\nendobj\n` +
    "2 70000 obj\n<<>>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.ok);
  expect(result.value.warnings).toHaveLength(1);
  const warning = result.value.warnings[0];
  expect(warning.code).toBe("XREF_REBUILD");
  expect(warning.recovery).toBeDefined();
  expect(warning.recovery).toContain("2");
  expect(warning.recovery).toContain("object-number-invalid");
  expect(warning.recovery).toContain("generation-invalid");
});

test.each([
  ["empty", new Uint8Array(0)],
  ["random 512 bytes", new Uint8Array(512).fill(0x41)],
  ["single obj", new TextEncoder().encode("1 0 obj\n<<>>\nendobj\n")],
  [
    "skip mixed",
    new TextEncoder().encode(
      "1 0 obj\n<<>>\nendobj\n2 70000 obj\n<<>>\nendobj\n",
    ),
  ],
])("任意の入力 %s で常に ok を返す", (_label, data) => {
  const result = scanFallback(data);
  expect(result.ok).toBe(true);
});
