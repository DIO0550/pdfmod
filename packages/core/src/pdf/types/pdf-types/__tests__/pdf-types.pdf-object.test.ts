import { assert, expect, expectTypeOf, test } from "vitest";
import {
  ByteOffset,
  ObjectParser,
  type PdfArray,
  type PdfName,
  PdfObject,
} from "../../../../index";
import { none, type Option, some } from "../../../../utils/option/index";

test.each([
  "/DeviceRGB",
  "[/ASCII85Decode /DCTDecode]",
  "[]",
])("名前・配列 %s は元のオブジェクトを保持する", (source) => {
  const parsed = ObjectParser.parse(
    new TextEncoder().encode(source),
    ByteOffset.of(0),
  );
  assert(parsed.ok);

  const result = PdfObject.asNameOrArray(parsed.value);

  expectTypeOf(result).toEqualTypeOf<Option<PdfName | PdfArray>>();
  assert(result.some);
  expect(result.value).toBe(parsed.value);
});

test.each([
  "null",
  "true",
  "42",
  "3.5",
  "(text)",
  "<< >>",
  "1 0 R",
])("名前・配列以外の %s は未設定になる", (source) => {
  const parsed = ObjectParser.parse(
    new TextEncoder().encode(source),
    ByteOffset.of(0),
  );
  assert(parsed.ok);

  expect(PdfObject.asNameOrArray(parsed.value)).toEqual(none);
});

test.each([
  ["1", some(1)],
  ["42", some(42)],
  ["0", none],
  ["-1", none],
  ["1.0", none],
  ["/Name", none],
  ["[]", none],
  ["null", none],
])("正の整数 %s の読み取りで整数の種類と符号を判別する", (source, expected) => {
  const parsed = ObjectParser.parse(
    new TextEncoder().encode(source),
    ByteOffset.of(0),
  );
  assert(parsed.ok);

  expect(PdfObject.asPositiveInteger(parsed.value)).toEqual(expected);
});

test("未指定のオブジェクトはどの変換でも未設定になる", () => {
  expect(PdfObject.asNameOrArray(undefined)).toEqual(none);
  expect(PdfObject.asPositiveInteger(undefined)).toEqual(none);
});

test("ストリームは名前・配列・正の整数として扱わない", async () => {
  const parsed = await ObjectParser.parseIndirectObject(
    new TextEncoder().encode(
      "1 0 obj\n<< /Length 4 >>\nstream\nDATA\nendstream\nendobj",
    ),
    ByteOffset.of(0),
  );
  assert(parsed.ok);

  expect(PdfObject.asNameOrArray(parsed.value.body)).toEqual(none);
  expect(PdfObject.asPositiveInteger(parsed.value.body)).toEqual(none);
});

test.each([
  { type: "integer", value: 3 },
  { type: "real", value: 0.5 },
] as const)("有限な $type を数値へ変換する", (object) => {
  expect(PdfObject.asFiniteNumber(object)).toEqual({
    some: true,
    value: object.value,
  });
});

test.each([
  { type: "real", value: Number.NaN },
  { type: "real", value: Number.POSITIVE_INFINITY },
  { type: "name", value: "3" },
] as const)("非有限値・数値以外は有限な数値として受理しない: $type $value", (object) => {
  expect(PdfObject.asFiniteNumber(object)).toEqual({ some: false });
});
