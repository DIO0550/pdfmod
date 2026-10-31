import { expect, test } from "vitest";
import { ObjectParser } from "../../../objects/object-parser/index";
import { ByteOffset } from "../../types/byte-offset/index";
import { PdfDictionaryReader } from "../index";

const readDictionary = (source: string): PdfDictionaryReader => {
  const offset = ByteOffset.of(0);
  const result = ObjectParser.parse(new TextEncoder().encode(source), offset);

  if (!result.ok) {
    throw new Error("辞書が必要です");
  }

  if (result.value.type !== "dictionary") {
    throw new Error("辞書が必要です");
  }

  return { dictionary: result.value, offset, path: "/Resources" };
};

test("暗号化以外の辞書でも指定した型の直接値を取得できる", () => {
  const reader = readDictionary("<< /Count 3 >>");
  const result = PdfDictionaryReader.required(reader, {
    key: "Count",
    type: "integer",
  });

  expect(result).toEqual({ ok: true, value: { type: "integer", value: 3 } });
  expect(reader.dictionary.entries.size).toBe(1);
});

test("任意キーの不在はNoneとして返す", () => {
  const reader = readDictionary("<< >>");

  expect(
    PdfDictionaryReader.optional(reader, { key: "Count", type: "integer" }),
  ).toEqual({ ok: true, value: { some: false } });
});

test("必須キーの不在は位置とパス付きのエラーになる", () => {
  const reader = readDictionary("<< >>");

  expect(
    PdfDictionaryReader.required(reader, { key: "Count", type: "integer" }),
  ).toMatchObject({
    ok: false,
    error: { code: "MISSING_REQUIRED_KEY", key: "/Resources/Count", offset: 0 },
  });
});

test.each([
  "null",
  "(3)",
  "5 0 R",
])("期待型と異なる %s は参照解決せず型エラーになる", (value) => {
  const reader = readDictionary(`<< /Count ${value} >>`);

  expect(
    PdfDictionaryReader.required(reader, { key: "Count", type: "integer" }),
  ).toMatchObject({
    ok: false,
    error: { code: "INVALID_KEY_TYPE", key: "/Resources/Count", offset: 0 },
  });
});
