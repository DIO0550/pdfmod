import { expect, test } from "vitest";
import {
  ByteOffset,
  TokenType,
  type TokenInlineImageDictEntry,
} from "../../../../pdf/index";
import { normalizeInlineImageDict } from "../index";

const makeEntry = (
  name: string,
  offset = 0,
): TokenInlineImageDictEntry => ({
  key: {
    type: TokenType.Name,
    value: name,
    offset: ByteOffset.of(offset),
  },
  value: [],
});

test("空配列入力は空配列を返す", () => {
  const result = normalizeInlineImageDict([]);

  expect(result).toEqual([]);
});

test("完全名キー (Width) はそのまま通過し元 entry が参照同一で返る", () => {
  const entry = makeEntry("Width");

  const result = normalizeInlineImageDict([entry]);

  expect(result[0]).toBe(entry);
});

test("未知キー (Foo) はそのまま通過し元 entry が参照同一で返る", () => {
  const entry = makeEntry("Foo");

  const result = normalizeInlineImageDict([entry]);

  expect(result[0]).toBe(entry);
});

test("空文字キーは略号テーブルに hit しないので passthrough", () => {
  const entry = makeEntry("");

  const result = normalizeInlineImageDict([entry]);

  expect(result[0]).toBe(entry);
});

test.each<[string]>([
  ["constructor"],
  ["toString"],
  ["__proto__"],
])(
  "Object.prototype 由来キー (%s) は hasOwn ガードで誤展開されず passthrough",
  (protoKey) => {
    const entry = makeEntry(protoKey);

    const result = normalizeInlineImageDict([entry]);

    expect(result[0]).toBe(entry);
    expect(result[0]?.key.value).toBe(protoKey);
  },
);

test("入力順 [/W, /H, /CS] は [Width, Height, ColorSpace] の順で返る", () => {
  const entries = [makeEntry("W"), makeEntry("H"), makeEntry("CS")];

  const result = normalizeInlineImageDict(entries);

  expect(result.map((e) => e.key.value)).toEqual([
    "Width",
    "Height",
    "ColorSpace",
  ]);
});

test("重複検査なし: [/W, /Width, /H] は [Width(展開), Width(完全名), Height(展開)] の順で 3 件返る", () => {
  const widthAbbrev = makeEntry("W");
  const widthFull = makeEntry("Width");
  const heightAbbrev = makeEntry("H");

  const result = normalizeInlineImageDict([
    widthAbbrev,
    widthFull,
    heightAbbrev,
  ]);

  expect(result).toHaveLength(3);
  expect(result.map((e) => e.key.value)).toEqual(["Width", "Width", "Height"]);
  expect(result[1]).toBe(widthFull);
});

test("入力配列・入力エントリを破壊しない", () => {
  const entries = [makeEntry("W", 1), makeEntry("Width", 2)];
  const snapshot = entries.map((e) => ({
    keyValue: e.key.value,
    keyOffset: e.key.offset,
  }));
  const originalLength = entries.length;

  normalizeInlineImageDict(entries);

  expect(entries.length).toBe(originalLength);
  expect(
    entries.map((e) => ({ keyValue: e.key.value, keyOffset: e.key.offset })),
  ).toEqual(snapshot);
});

test("戻り値は入力配列と別インスタンス", () => {
  const entries = [makeEntry("W")];

  const result = normalizeInlineImageDict(entries);

  expect(result).not.toBe(entries);
});
