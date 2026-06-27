import { expect, test } from "vitest";
import {
  ByteOffset,
  type Token,
  type TokenInlineImageDictEntry,
  TokenType,
} from "../../../../pdf/index";
import { InlineImageDict } from "../index";

const nameToken = (value: string, offset = 0): Token => ({
  type: TokenType.Name,
  value,
  offset: ByteOffset.of(offset),
});

const integerToken = (value: number): Token => ({
  type: TokenType.Integer,
  value,
  offset: ByteOffset.of(0),
});

const booleanToken = (value: boolean): Token => ({
  type: TokenType.Boolean,
  value,
  offset: ByteOffset.of(0),
});

const arrayBeginToken = (): Token => ({
  type: TokenType.ArrayBegin,
  value: "[",
  offset: ByteOffset.of(0),
});

const arrayEndToken = (): Token => ({
  type: TokenType.ArrayEnd,
  value: "]",
  offset: ByteOffset.of(0),
});

const dictBeginToken = (): Token => ({
  type: TokenType.DictBegin,
  value: "<<",
  offset: ByteOffset.of(0),
});

const dictEndToken = (): Token => ({
  type: TokenType.DictEnd,
  value: ">>",
  offset: ByteOffset.of(0),
});

const makeEntry = (
  key: string,
  value: ReadonlyArray<Token>,
): TokenInlineImageDictEntry => ({
  key: { type: TokenType.Name, value: key, offset: ByteOffset.of(0) },
  value,
});

test.each<[string, string]>([
  ["G", "DeviceGray"],
  ["RGB", "DeviceRGB"],
  ["CMYK", "DeviceCMYK"],
  ["I", "Indexed"],
])("ColorSpace 略号 /%s は完全名 /%s に展開される", (abbrev, fullName) => {
  // PDF §8.9.5.1 Table 89 の ColorSpace 値側略号 4 種をそれぞれ 1 ケースずつ展開
  const dict = [makeEntry("ColorSpace", [nameToken(abbrev)])];

  const result = InlineImageDict.expandValueAbbrevs(dict);

  expect(result[0]?.value[0]).toEqual({
    type: TokenType.Name,
    value: fullName,
    offset: ByteOffset.of(0),
  });
});

test.each<[string, string]>([
  ["AHx", "ASCIIHexDecode"],
  ["A85", "ASCII85Decode"],
  ["LZW", "LZWDecode"],
  ["Fl", "FlateDecode"],
  ["RL", "RunLengthDecode"],
  ["CCF", "CCITTFaxDecode"],
  ["DCT", "DCTDecode"],
])("Filter 略号 /%s は完全名 /%s に展開される", (abbrev, fullName) => {
  // PDF §8.9.5.1 Table 89 の Filter 値側略号 7 種を network 1 ケースずつ展開
  const dict = [makeEntry("Filter", [nameToken(abbrev)])];

  const result = InlineImageDict.expandValueAbbrevs(dict);

  expect(result[0]?.value[0]).toEqual({
    type: TokenType.Name,
    value: fullName,
    offset: ByteOffset.of(0),
  });
});

test("ColorSpace entry に完全名 Name token を渡しても素通しする（同一参照）", () => {
  // 既に完全名なら参照同一性を保ったまま素通し（最適化境界）
  const value: ReadonlyArray<Token> = [nameToken("DeviceRGB")];
  const dict = [makeEntry("ColorSpace", value)];

  const result = InlineImageDict.expandValueAbbrevs(dict);

  expect(result[0]?.value).toBe(value);
  expect(result[0]).toBe(dict[0]);
});

test("ColorSpace entry に未知の Name token を渡しても素通しする（同一参照）", () => {
  // テーブル未登録の名前は加工せず通す（hasOwn ガード）
  const value: ReadonlyArray<Token> = [nameToken("Unknown")];
  const dict = [makeEntry("ColorSpace", value)];

  const result = InlineImageDict.expandValueAbbrevs(dict);

  expect(result[0]?.value).toBe(value);
});

test("ColorSpace entry の value 配列が空のとき同一参照で素通しする", () => {
  // 配列内置換ゼロ → value 同一参照 → entry 同一参照（4 階層ルール）
  const value: ReadonlyArray<Token> = [];
  const dict = [makeEntry("ColorSpace", value)];

  const result = InlineImageDict.expandValueAbbrevs(dict);

  expect(result[0]?.value).toBe(value);
  expect(result[0]).toBe(dict[0]);
});

test("Filter entry の value 配列に複数 Name 略号があるとき各要素を展開する", () => {
  // 配列フィルタ /Filter [/AHx /Fl] のケース
  const dict = [makeEntry("Filter", [nameToken("AHx"), nameToken("Fl")])];

  const result = InlineImageDict.expandValueAbbrevs(dict);

  expect(result[0]?.value[0]).toEqual({
    type: TokenType.Name,
    value: "ASCIIHexDecode",
    offset: ByteOffset.of(0),
  });
  expect(result[0]?.value[1]).toEqual({
    type: TokenType.Name,
    value: "FlateDecode",
    offset: ByteOffset.of(0),
  });
});

test("ColorSpace entry の value に Name 略号と Integer と未知 Name が混在するとき Name 略号のみ展開し他は同一参照で素通しする", () => {
  // 4 階層参照同一性ルール（implementation-plan §「inline-image-dict コンパニオン本体」L264-267）の混在ケース最終確認:
  // - value[0] Name("RGB"): hit → 新 TokenName(DeviceRGB)
  // - value[1] Integer(1):  Name 以外 → 同一参照素通し
  // - value[2] Name("Unknown"): table miss → 同一参照素通し（hasOwn ガード）
  const intTok = integerToken(1);
  const unknownTok = nameToken("Unknown");
  const dict = [
    makeEntry("ColorSpace", [nameToken("RGB"), intTok, unknownTok]),
  ];

  const result = InlineImageDict.expandValueAbbrevs(dict);

  const value = result[0]?.value;
  expect(value?.[0]).toEqual({
    type: TokenType.Name,
    value: "DeviceRGB",
    offset: ByteOffset.of(0),
  });
  expect(value?.[1]).toBe(intTok);
  expect(value?.[2]).toBe(unknownTok);
});

test("ColorSpace entry に Boolean token が現れたら素通しする", () => {
  // 型不一致 token は走査対象外
  const tok = booleanToken(true);
  const dict = [makeEntry("ColorSpace", [tok])];

  const result = InlineImageDict.expandValueAbbrevs(dict);

  expect(result[0]?.value[0]).toBe(tok);
});

test("Filter entry に ArrayBegin / ArrayEnd token が含まれても再帰せず素通しする", () => {
  // 配列 token は走査対象外（PDF §8.9.5.1 Table 89 は 1 階層の Name のみ）
  const begin = arrayBeginToken();
  const end = arrayEndToken();
  const dict = [makeEntry("Filter", [begin, nameToken("Fl"), end])];

  const result = InlineImageDict.expandValueAbbrevs(dict);

  expect(result[0]?.value[0]).toBe(begin);
  expect(result[0]?.value[1]).toEqual({
    type: TokenType.Name,
    value: "FlateDecode",
    offset: ByteOffset.of(0),
  });
  expect(result[0]?.value[2]).toBe(end);
});

test("Filter entry に DictBegin / DictEnd token が含まれても再帰せず素通しする", () => {
  // 辞書 token も走査対象外
  const begin = dictBeginToken();
  const end = dictEndToken();
  const dict = [makeEntry("Filter", [begin, end])];

  const result = InlineImageDict.expandValueAbbrevs(dict);

  expect(result[0]?.value[0]).toBe(begin);
  expect(result[0]?.value[1]).toBe(end);
});

test("ColorSpace entry value 先頭 (idx=0) で置換された Name の offset が元 token から継承される", () => {
  // 置換後 TokenName.offset は元 Name token の offset
  const dict = [makeEntry("ColorSpace", [nameToken("RGB", 17)])];

  const result = InlineImageDict.expandValueAbbrevs(dict);

  expect(result[0]?.value[0]?.offset).toBe(ByteOffset.of(17));
});

test("Filter entry value idx=2 で置換された Name の offset が元 token から継承される", () => {
  // 配列内位置に依らず offset が伝搬する
  const dict = [
    makeEntry("Filter", [
      nameToken("ASCII85Decode", 10),
      nameToken("LZWDecode", 20),
      nameToken("Fl", 30),
    ]),
  ];

  const result = InlineImageDict.expandValueAbbrevs(dict);

  expect(result[0]?.value[2]?.offset).toBe(ByteOffset.of(30));
});

test('key scoped: /Width entry の value 配列に Name("RGB") があっても展開せず entry 同一参照で素通しする', () => {
  // ColorSpace / Filter 以外の key は value を一切走査しない（同一参照）
  const value: ReadonlyArray<Token> = [nameToken("RGB"), nameToken("AHx")];
  const entry = makeEntry("Width", value);
  const dict = [entry];

  const result = InlineImageDict.expandValueAbbrevs(dict);

  expect(result[0]).toBe(entry);
  expect(result[0]?.value).toBe(value);
});

test('key scoped: /Interpolate entry の value に Name("I") があっても展開しない', () => {
  // CS テーブルに I→Indexed が定義されているが、key が /Interpolate の場合は対象外
  const value: ReadonlyArray<Token> = [nameToken("I")];
  const entry = makeEntry("Interpolate", value);
  const dict = [entry];

  const result = InlineImageDict.expandValueAbbrevs(dict);

  expect(result[0]).toBe(entry);
  expect(result[0]?.value).toBe(value);
});

test("入力 dict / entry / value 配列を破壊しない（非破壊保証）", () => {
  // normalize と同じ pin down 観点: 入力は不変
  const value: ReadonlyArray<Token> = [nameToken("RGB")];
  const entry = makeEntry("ColorSpace", value);
  const dict = [entry];
  const snapshotDict = [...dict];
  const snapshotEntry = { key: entry.key, value: [...entry.value] };

  InlineImageDict.expandValueAbbrevs(dict);

  expect(dict).toEqual(snapshotDict);
  expect(entry.key).toBe(snapshotEntry.key);
  expect(entry.value).toEqual(snapshotEntry.value);
});

test("トップレベル dict は常に新配列（参照同一性の境界）", () => {
  // normalize と同じセマンティクス: dict.map により必ず新配列
  const dict = [makeEntry("Width", [integerToken(1)])];

  const result = InlineImageDict.expandValueAbbrevs(dict);

  expect(result).not.toBe(dict);
});

test("4 階層ルール 0 置換: ColorSpace 全 token が未知/完全名のみで entry 同一参照", () => {
  // 配列内置換ゼロ → value 同一参照 → entry 同一参照
  const value: ReadonlyArray<Token> = [
    nameToken("DeviceRGB"),
    nameToken("Unknown"),
  ];
  const entry = makeEntry("ColorSpace", value);
  const dict = [entry];

  const result = InlineImageDict.expandValueAbbrevs(dict);

  expect(result[0]).toBe(entry);
  expect(result[0]?.value).toBe(value);
});

test("4 階層ルール 1 置換: ColorSpace value 内 1 token のみ略号で entry 新規・非対象 token 同一参照", () => {
  // 配列内置換あり → entry 新規・value 新配列だが、置換しなかった token は同一参照を維持
  const passthrough = nameToken("DeviceRGB");
  const entry = makeEntry("ColorSpace", [nameToken("RGB"), passthrough]);
  const dict = [entry];

  const result = InlineImageDict.expandValueAbbrevs(dict);

  expect(result[0]).not.toBe(entry);
  expect(result[0]?.value).not.toBe(entry.value);
  expect(result[0]?.value[0]).not.toBe(entry.value[0]);
  expect(result[0]?.value[1]).toBe(passthrough);
});

test("4 階層ルール 全置換: Filter value の全要素が略号で各 token が新規", () => {
  // 全 token 置換のとき entry / value / 各 token がすべて新規参照
  const entry = makeEntry("Filter", [nameToken("AHx"), nameToken("Fl")]);
  const dict = [entry];

  const result = InlineImageDict.expandValueAbbrevs(dict);

  expect(result[0]).not.toBe(entry);
  expect(result[0]?.value).not.toBe(entry.value);
  expect(result[0]?.value[0]).not.toBe(entry.value[0]);
  expect(result[0]?.value[1]).not.toBe(entry.value[1]);
});
