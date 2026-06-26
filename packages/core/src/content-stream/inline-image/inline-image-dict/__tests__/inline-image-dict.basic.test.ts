import { expect, test } from "vitest";
import {
  ByteOffset,
  type Token,
  type TokenInlineImageDictEntry,
  TokenType,
} from "../../../../pdf/index";
import { InlineImageDict } from "../index";

const makeEntry = (
  abbrev: string,
  offset = 0,
  value: ReadonlyArray<Token> = [],
): TokenInlineImageDictEntry => ({
  key: {
    type: TokenType.Name,
    value: abbrev,
    offset: ByteOffset.of(offset),
  },
  value,
});

test.each<[string, string]>([
  ["W", "Width"],
  ["H", "Height"],
  ["BPC", "BitsPerComponent"],
  ["CS", "ColorSpace"],
  ["F", "Filter"],
  ["D", "Decode"],
  ["DP", "DecodeParms"],
  ["IM", "ImageMask"],
  ["I", "Interpolate"],
])("略号 /%s は完全名 /%s へ展開される", (abbrev, fullName) => {
  const entry = makeEntry(abbrev);

  const result = InlineImageDict.normalize([entry]);

  expect(result[0]?.key.value).toBe(fullName);
});

test("展開後の TokenName.offset は略号 entry の元 offset を保持する", () => {
  const entry = makeEntry("W", 42);

  const result = InlineImageDict.normalize([entry]);

  expect(result[0]?.key.offset).toBe(ByteOffset.of(42));
});

test("展開後の entry.value は元 entry の value 参照と同一", () => {
  const value: ReadonlyArray<Token> = [
    { type: TokenType.Integer, value: 1, offset: ByteOffset.of(2) },
  ];
  const entry = makeEntry("W", 0, value);

  const result = InlineImageDict.normalize([entry]);

  expect(result[0]?.value).toBe(value);
});

test("展開後の key.type は Name のまま", () => {
  const entry = makeEntry("W");

  const result = InlineImageDict.normalize([entry]);

  expect(result[0]?.key.type).toBe(TokenType.Name);
});

test("スコープ境界: /CS の値配列に Name `RGB` があっても key のみ ColorSpace に展開され value は加工されない", () => {
  const value: ReadonlyArray<Token> = [
    { type: TokenType.Name, value: "RGB", offset: ByteOffset.of(3) },
  ];
  const entry = makeEntry("CS", 0, value);

  const result = InlineImageDict.normalize([entry]);

  expect(result[0]?.key.value).toBe("ColorSpace");
  expect(result[0]?.value).toBe(value);
  expect(result[0]?.value[0]).toEqual({
    type: TokenType.Name,
    value: "RGB",
    offset: ByteOffset.of(3),
  });
});

test("スコープ境界: /F の値配列に Name `Fl` があっても key のみ Filter に展開され value は加工されない", () => {
  const value: ReadonlyArray<Token> = [
    { type: TokenType.Name, value: "Fl", offset: ByteOffset.of(4) },
  ];
  const entry = makeEntry("F", 0, value);

  const result = InlineImageDict.normalize([entry]);

  expect(result[0]?.key.value).toBe("Filter");
  expect(result[0]?.value).toBe(value);
  expect(result[0]?.value[0]).toEqual({
    type: TokenType.Name,
    value: "Fl",
    offset: ByteOffset.of(4),
  });
});
