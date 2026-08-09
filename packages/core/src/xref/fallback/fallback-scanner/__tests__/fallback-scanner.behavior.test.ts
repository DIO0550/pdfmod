import { assert, expect, test } from "vitest";
import {
  ByteOffset,
  GenerationNumber,
  ObjectNumber,
} from "../../../../pdf/types/index";
import { scanFallback } from "../../fallback-scanner";

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

test("`1 0 obj` 1 件含むデータから XRefTable を構築する (FB-001)", () => {
  const data = encode("1 0 obj\n<<>>\nendobj\n");
  const result = scanFallback(data);
  const { xrefTable, trailer, warnings } = result;
  expect(xrefTable.entries.size).toBe(1);
  expect(xrefTable.size).toBe(2);
  expect(xrefTable.entries.get(ObjectNumber.of(1))).toEqual({
    type: 1,
    offset: ByteOffset.of(0),
    generationNumber: GenerationNumber.of(0),
  });
  expect(trailer.some).toBe(false);
  expect(warnings).toHaveLength(1);
  expect(warnings[0].code).toBe("XREF_REBUILD");
});

test("`obj` 皆無のデータでは空 XRefTable と XREF_REBUILD warning 1 件を返す", () => {
  const data = encode("%PDF-1.7\n%%EOF\n");
  const result = scanFallback(data);
  const { xrefTable, warnings } = result;
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
  expect(result.xrefTable.entries.size).toBe(0);
  expect(result.xrefTable.size).toBe(0);
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0].code).toBe("XREF_REBUILD");
});

test("同一オブジェクト番号の重複は末尾優先で採用される (FB-003)", () => {
  const body = "1 0 obj\n<<>>\nendobj\n1 0 obj\n<</Late true>>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  const entry = result.xrefTable.entries.get(ObjectNumber.of(1));
  const lastOffset = body.lastIndexOf("1 0 obj");
  expect(entry).toEqual({
    type: 1,
    offset: ByteOffset.of(lastOffset),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.xrefTable.entries.size).toBe(1);
  expect(result.xrefTable.size).toBe(2);
});

test("XRefTable.size は max(objectNumber) + 1 で計算される", () => {
  const body = "1 0 obj\nx\nendobj\n5 0 obj\nx\nendobj\n3 0 obj\nx\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  expect(result.xrefTable.size).toBe(6);
  expect(result.xrefTable.entries.size).toBe(3);
});

test("MAX_SAFE_INTEGER のオブジェクト番号は size 超過のため skip され、recovery に size-overflow が記録される", () => {
  const maxSafeInt = String(Number.MAX_SAFE_INTEGER);
  const body = `1 0 obj\n<<>>\nendobj\n${maxSafeInt} 0 obj\n<<>>\nendobj\n`;
  const data = encode(body);
  const result = scanFallback(data);
  expect(Number.isSafeInteger(result.xrefTable.size)).toBe(true);
  expect(result.xrefTable.size).toBe(2);
  expect(result.xrefTable.entries.size).toBe(1);
  expect(result.warnings).toHaveLength(1);
  const warning = result.warnings[0];
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
  expect(result.warnings).toHaveLength(1);
  const warning = result.warnings[0];
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
])("任意の入力 %s で例外を投げない", (_label, data) => {
  expect(() => scanFallback(data)).not.toThrow();
});

test("末尾の trailer << /Root 1 0 R /Size 2 >> から TrailerDict が取得される (FB-002)", () => {
  const body = "1 0 obj\n<<>>\nendobj\ntrailer\n<< /Root 1 0 R /Size 2 >>\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.trailer.some);
  expect(result.trailer.value.root).toEqual({
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.trailer.value.size).toBe(2);
});

test("コメント内 `% trailer << ... >>` は trailer として採用しない", () => {
  const body =
    "1 0 obj\n<<>>\nendobj\n" + "% trailer << /Root 999 0 R /Size 999 >>\n";
  const data = encode(body);
  const result = scanFallback(data);
  expect(result.trailer.some).toBe(false);
});

test("`mytrailer` のような部分一致は trailer として扱わない", () => {
  const body =
    "1 0 obj\n<<>>\nendobj\n" + "mytrailer << /Root 999 0 R /Size 999 >>\n";
  const data = encode(body);
  const result = scanFallback(data);
  expect(result.trailer.some).toBe(false);
});

test("scope 外の `trailer xyz` (parseTrailer 失敗) があっても次候補の正規 trailer にフォールバックする", () => {
  const body =
    "1 0 obj\n<<>>\nendobj\n" +
    "trailer\n<< /Root 1 0 R /Size 2 >>\n" +
    "trailer xyz\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.trailer.some);
  expect(result.trailer.value.root).toEqual({
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.trailer.value.size).toBe(2);
});

test("trailer 不在 + /Type /Catalog 単一 → 最小 TrailerDict を合成する (FB-004)", () => {
  const body = "1 0 obj\n<< /Type /Catalog >>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.trailer.some);
  expect(result.trailer.value).toEqual({
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
  assert(result.trailer.some);
  expect(result.trailer.value.root).toEqual({
    objectNumber: ObjectNumber.of(5),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.trailer.value.size).toBe(6);
});

test("/Type/Catalog（スペース無し派生）も Catalog 推定の対象になる", () => {
  const body = "1 0 obj\n<</Type/Catalog>>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.trailer.some);
  expect(result.trailer.value.root.objectNumber).toBe(ObjectNumber.of(1));
});

test("ストリームデータ内の `/Type /Catalog` バイト列は別 obj の正規 Catalog より優先しない", () => {
  const body =
    "1 0 obj\n<< /Type /Catalog >>\nendobj\n" +
    "5 0 obj\n<< /Length 14 >>\nstream\n/Type /Catalog\nendstream\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.trailer.some);
  expect(result.trailer.value.root).toEqual({
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
  });
});

test("`endobj` 後の `garbage /Type /Catalog` は obj scope 外のため root に紐付けない", () => {
  const body = "1 0 obj\n<<>>\nendobj\ngarbage /Type /Catalog\n";
  const data = encode(body);
  const result = scanFallback(data);
  expect(result.trailer.some).toBe(false);
});

test("ストリーム内に `endobj` と valid-looking trailer が同居しても obj scope は本当の endobj まで保たれる", () => {
  const body =
    "1 0 obj\n<<>>\nendobj\n" +
    "trailer\n<< /Root 1 0 R /Size 2 >>\n" +
    "5 0 obj\n<< /Length 99 >>\nstream\nendobj\ntrailer << /Root 9 0 R /Size 99 >>\nendstream\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.trailer.some);
  expect(result.trailer.value.root).toEqual({
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.trailer.value.size).toBe(2);
});

test("ストリーム内の valid-looking `trailer << /Root .. /Size .. >>` は obj scope のため採用しない", () => {
  const body =
    "1 0 obj\n<<>>\nendobj\n" +
    "trailer\n<< /Root 1 0 R /Size 2 >>\n" +
    "5 0 obj\n<<>>\nstream\ntrailer << /Root 9 0 R /Size 99 >>\nendstream\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.trailer.some);
  expect(result.trailer.value.root).toEqual({
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
  });
  expect(result.trailer.value.size).toBe(2);
});

test("trailer も /Type /Catalog も無い場合 trailer は None", () => {
  const body = "1 0 obj\n<<>>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  expect(result.trailer.some).toBe(false);
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0].code).toBe("XREF_REBUILD");
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
])("trailer 系入力 %s でも例外を投げない", (_label, data) => {
  expect(() => scanFallback(data)).not.toThrow();
});

test("/Type /XRef obj 内に /Encrypt があるとき合成 trailer に encrypt を付与する", () => {
  const body =
    "5 0 obj\n<< /Type /XRef /Size 6 /Encrypt 4 0 R >>\nendobj\n" +
    "1 0 obj\n<< /Type /Catalog >>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.trailer.some);
  expect(result.trailer.value.encrypt).toBeDefined();
});

test("/Type /XRef obj に /Encrypt が無いとき合成 trailer に encrypt を付与しない", () => {
  const body =
    "5 0 obj\n<< /Type /XRef /Size 6 >>\nendobj\n" +
    "1 0 obj\n<< /Type /Catalog >>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.trailer.some);
  expect(result.trailer.value.encrypt).toBeUndefined();
});

test("/Type/XRef（スペース無し派生）+ /Encrypt も暗号化として検出する", () => {
  const body =
    "5 0 obj\n<</Type/XRef/Size 6/Encrypt 4 0 R>>\nendobj\n" +
    "1 0 obj\n<< /Type /Catalog >>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.trailer.some);
  expect(result.trailer.value.encrypt).toBeDefined();
});

test("/Type/XRef（スペース無し派生）に /Encrypt が無ければ encrypt を付与しない", () => {
  const body =
    "5 0 obj\n<</Type/XRef/Size 6>>\nendobj\n" +
    "1 0 obj\n<< /Type /Catalog >>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.trailer.some);
  expect(result.trailer.value.encrypt).toBeUndefined();
});

test("ストリームデータ内の `/Encrypt` バイト列は暗号化として検出しない", () => {
  const body =
    "5 0 obj\n<< /Type /XRef /Length 14 >>\nstream\n/Encrypt 4 0 R\nendstream\nendobj\n" +
    "1 0 obj\n<< /Type /Catalog >>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.trailer.some);
  expect(result.trailer.value.encrypt).toBeUndefined();
});

test("ストリームデータ内の `/Type /XRef` バイト列は xref ストリーム obj として扱わない", () => {
  const body =
    "5 0 obj\n<< /Encrypt 4 0 R /Length 11 >>\nstream\n/Type /XRef\nendstream\nendobj\n" +
    "1 0 obj\n<< /Type /Catalog >>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.trailer.some);
  expect(result.trailer.value.encrypt).toBeUndefined();
});

test("/Encrypt が /Type /XRef と別 obj にある場合は暗号化として検出しない", () => {
  const body =
    "5 0 obj\n<< /Type /XRef /Size 6 >>\nendobj\n" +
    "4 0 obj\n<< /Encrypt 3 0 R >>\nendobj\n" +
    "1 0 obj\n<< /Type /Catalog >>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.trailer.some);
  expect(result.trailer.value.encrypt).toBeUndefined();
});

test("`endobj` 後の `garbage /Type /XRef /Encrypt` は obj scope 外のため検出しない", () => {
  const body =
    "1 0 obj\n<< /Type /Catalog >>\nendobj\n" +
    "garbage /Type /XRef /Encrypt 4 0 R\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.trailer.some);
  expect(result.trailer.value.encrypt).toBeUndefined();
});

test("/Type /XRef obj が複数あり片方だけ /Encrypt を持つ場合も検出する", () => {
  const body =
    "5 0 obj\n<< /Type /XRef /Size 7 >>\nendobj\n" +
    "6 0 obj\n<< /Type /XRef /Encrypt 4 0 R >>\nendobj\n" +
    "1 0 obj\n<< /Type /Catalog >>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.trailer.some);
  expect(result.trailer.value.encrypt).toBeDefined();
});

test("obj が 1 件も無いデータでは /Type /XRef /Encrypt があっても trailer は None", () => {
  const data = encode("%PDF-1.7\n/Type /XRef /Encrypt 4 0 R\n%%EOF\n");
  const result = scanFallback(data);
  expect(result.trailer.some).toBe(false);
});

test("/Encrypt を持たないテキスト trailer 採用時も /Type /XRef obj の /Encrypt を検出する (FB-002)", () => {
  const body =
    "1 0 obj\n<< /Type /Catalog >>\nendobj\n" +
    "trailer\n<< /Root 1 0 R /Size 6 >>\n" +
    "5 0 obj\n<< /Type /XRef /Size 6 /Encrypt 4 0 R >>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.trailer.some);
  expect(result.trailer.value.encrypt).toBeDefined();
});

test("テキスト trailer 自身の /Encrypt はマーカーで上書きされず間接参照のまま保たれる (FB-002)", () => {
  const body =
    "1 0 obj\n<< /Type /Catalog >>\nendobj\n" +
    "trailer\n<< /Root 1 0 R /Size 6 /Encrypt 4 0 R >>\n" +
    "5 0 obj\n<< /Type /XRef /Size 6 /Encrypt 4 0 R >>\nendobj\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.trailer.some);
  expect(result.trailer.value.encrypt).toEqual({
    objectNumber: ObjectNumber.of(4),
    generationNumber: GenerationNumber.of(0),
  });
});

test("テキスト trailer 採用時に /Type /XRef obj が無ければ encrypt を付与しない (FB-002)", () => {
  const body =
    "1 0 obj\n<< /Type /Catalog >>\nendobj\n" +
    "trailer\n<< /Root 1 0 R /Size 6 >>\n";
  const data = encode(body);
  const result = scanFallback(data);
  assert(result.trailer.some);
  expect(result.trailer.value.encrypt).toBeUndefined();
});
