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

test("MAX_SAFE_INTEGER のオブジェクト番号は size 超過のため skip され、recovery に size-overflow が記録される", () => {
  const maxSafeInt = String(Number.MAX_SAFE_INTEGER);
  const body = `1 0 obj\n<<>>\nendobj\n${maxSafeInt} 0 obj\n<<>>\nendobj\n`;
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.ok);
  expect(Number.isSafeInteger(result.value.xrefTable.size)).toBe(true);
  expect(result.value.xrefTable.size).toBe(2);
  expect(result.value.xrefTable.entries.size).toBe(1);
  expect(result.value.warnings).toHaveLength(1);
  const warning = result.value.warnings[0];
  expect(warning.code).toBe("XREF_REBUILD");
  expect(warning.recovery).toContain("size-overflow");
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

test("末尾の trailer << /Root 1 0 R /Size 2 >> から TrailerDict が取得される (FB-002)", () => {
  const body = "1 0 obj\n<<>>\nendobj\ntrailer\n<< /Root 1 0 R /Size 2 >>\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.ok);
  expect(result.value.trailer).toBeDefined();
  expect(result.value.trailer?.root).toEqual({
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.trailer?.size).toBe(2);
});

test("コメント内 `% trailer << ... >>` は trailer として採用しない", () => {
  const body =
    "1 0 obj\n<<>>\nendobj\n" + "% trailer << /Root 999 0 R /Size 999 >>\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.ok);
  expect(result.value.trailer).toBeUndefined();
});

test("`mytrailer` のような部分一致は trailer として扱わない", () => {
  const body =
    "1 0 obj\n<<>>\nendobj\n" + "mytrailer << /Root 999 0 R /Size 999 >>\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.ok);
  expect(result.value.trailer).toBeUndefined();
});

test("ストリーム内 `trailer xyz` 偶発一致は parseTrailer 失敗で次候補にフォールバックする", () => {
  const body =
    "1 0 obj\n<<>>\nendobj\n" +
    "trailer\n<< /Root 1 0 R /Size 2 >>\n" +
    "5 0 obj\n<<>>\nstream\ntrailer xyz\nendstream\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.ok);
  expect(result.value.trailer).toBeDefined();
  expect(result.value.trailer?.root).toEqual({
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.trailer?.size).toBe(2);
});

test("trailer 不在 + /Type /Catalog 単一 → 最小 TrailerDict を合成する (FB-004)", () => {
  const body = "1 0 obj\n<< /Type /Catalog >>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.ok);
  expect(result.value.trailer).toEqual({
    root: {
      objectNumber: ObjectNumber.of(1),
      generationNumber: GenerationNumber.of(0),
    },
    size: 2,
  });
});

test("/Type /Catalog が複数あるときは末尾 obj を root に採用する (FB-004 末尾優先)", () => {
  const body =
    "1 0 obj\n<< /Type /Catalog >>\nendobj\n" +
    "5 0 obj\n<< /Type /Catalog >>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.ok);
  expect(result.value.trailer?.root).toEqual({
    objectNumber: ObjectNumber.of(5),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.trailer?.size).toBe(6);
});

test("/Type/Catalog（スペース無し派生）も Catalog 推定の対象になる", () => {
  const body = "1 0 obj\n<</Type/Catalog>>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.ok);
  expect(result.value.trailer?.root.objectNumber).toBe(ObjectNumber.of(1));
});

test("`endobj` 後の `garbage /Type /Catalog` は obj scope 外のため root に紐付けない", () => {
  const body = "1 0 obj\n<<>>\nendobj\ngarbage /Type /Catalog\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.ok);
  expect(result.value.trailer).toBeUndefined();
});

test("ストリーム内に `endobj` と valid-looking trailer が同居しても obj scope は本当の endobj まで保たれる", () => {
  const body =
    "1 0 obj\n<<>>\nendobj\n" +
    "trailer\n<< /Root 1 0 R /Size 2 >>\n" +
    "5 0 obj\n<< /Length 99 >>\nstream\nendobj\ntrailer << /Root 9 0 R /Size 99 >>\nendstream\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.ok);
  expect(result.value.trailer?.root).toEqual({
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.trailer?.size).toBe(2);
});

test("ストリーム内の valid-looking `trailer << /Root .. /Size .. >>` は obj scope のため採用しない", () => {
  const body =
    "1 0 obj\n<<>>\nendobj\n" +
    "trailer\n<< /Root 1 0 R /Size 2 >>\n" +
    "5 0 obj\n<<>>\nstream\ntrailer << /Root 9 0 R /Size 99 >>\nendstream\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.ok);
  expect(result.value.trailer?.root).toEqual({
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.value.trailer?.size).toBe(2);
});

test("trailer も /Type /Catalog も無い場合 trailer は undefined", () => {
  const body = "1 0 obj\n<<>>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.ok);
  expect(result.value.trailer).toBeUndefined();
  expect(result.value.warnings).toHaveLength(1);
  expect(result.value.warnings[0].code).toBe("XREF_REBUILD");
});

test.each([
  ["empty", new Uint8Array(0)],
  [
    "trailer only",
    new TextEncoder().encode("trailer << /Root 1 0 R /Size 2 >>\n"),
  ],
  [
    "obj + trailer",
    new TextEncoder().encode(
      "1 0 obj\n<<>>\nendobj\ntrailer\n<< /Root 1 0 R /Size 2 >>\n",
    ),
  ],
  [
    "obj + catalog only",
    new TextEncoder().encode("1 0 obj\n<< /Type /Catalog >>\nendobj\n"),
  ],
  [
    "comment trailer",
    new TextEncoder().encode("1 0 obj\n<<>>\nendobj\n% trailer << ... >>\n"),
  ],
])("trailer 系入力 %s でも常に ok を返す", (_label, data) => {
  const result = scanFallback(data);
  expect(result.ok).toBe(true);
});
