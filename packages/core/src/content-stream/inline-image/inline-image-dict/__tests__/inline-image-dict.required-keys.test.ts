import { expect, test } from "vitest";
import {
  ByteOffset,
  type Token,
  type TokenInlineImageDictEntry,
  TokenType,
} from "../../../../pdf/index";
import { InlineImageDict, type InlineImageRequiredKey } from "../index";

const integerToken = (value: number): Token => ({
  type: TokenType.Integer,
  value,
  offset: ByteOffset.of(0),
});

const nameToken = (value: string): Token => ({
  type: TokenType.Name,
  value,
  offset: ByteOffset.of(0),
});

const makeEntry = (
  key: string,
  value: ReadonlyArray<Token> = [integerToken(1)],
): TokenInlineImageDictEntry => ({
  key: { type: TokenType.Name, value: key, offset: ByteOffset.of(0) },
  value,
});

const fullDict = (): TokenInlineImageDictEntry[] => [
  makeEntry("Width"),
  makeEntry("Height"),
  makeEntry("BitsPerComponent"),
  makeEntry("ColorSpace", [nameToken("DeviceGray")]),
];

test("imageMask=false で必須 4 キーすべて完全名で揃っているとき none を返す", () => {
  // 通常画像経路: Width/Height/BPC/ColorSpace の 4 キーがすべて存在
  const result = InlineImageDict.findMissingRequiredKey(fullDict(), false);

  expect(result.some).toBe(false);
});

test("imageMask=true で Width/Height のみ揃っているとき none を返す（stencil mask 最小集合）", () => {
  // stencil mask 最小集合: Width/Height のみで十分。BPC を含まない最小ケース
  const dict = [makeEntry("Width"), makeEntry("Height")];

  const result = InlineImageDict.findMissingRequiredKey(dict, true);

  expect(result.some).toBe(false);
});

test("BitsPerComponent は imageMask=true で optional、imageMask=false で必須（対比で BPC 扱い差分を pin down）", () => {
  // ISO 32000-1:2008 §8.9.5 Table 89: stencil mask では BPC は optional (default 1)。
  // 同じ dict [Width, Height] で imageMask フラグだけを切り替えると、
  // - imageMask=true:  none（BPC は stencil で optional）
  // - imageMask=false: some('BitsPerComponent')（通常画像で BPC は必須）
  // 入力共有でフラグ差分のみが結果を変える対比により BPC の扱いそのものを単独 pin down する。
  const dict = [makeEntry("Width"), makeEntry("Height")];

  const stencil = InlineImageDict.findMissingRequiredKey(dict, true);
  const normal = InlineImageDict.findMissingRequiredKey(dict, false);

  expect(stencil.some).toBe(false);
  expect(normal.some).toBe(true);
  if (normal.some) {
    expect(normal.value).toBe("BitsPerComponent");
  }
});

test("imageMask=true で ColorSpace が dict に余分に含まれても none を返す（現実装の既存挙動）", () => {
  // 仕様上は stencil mask で ColorSpace は禁止だが、本実装は禁止違反は検知しない
  const dict = [
    makeEntry("Width"),
    makeEntry("Height"),
    makeEntry("ColorSpace", [nameToken("DeviceGray")]),
  ];

  const result = InlineImageDict.findMissingRequiredKey(dict, true);

  expect(result.some).toBe(false);
});

test.each<[InlineImageRequiredKey]>([
  ["Width"],
  ["Height"],
  ["BitsPerComponent"],
  ["ColorSpace"],
])("imageMask=false で %s が単独欠落のとき some(%s) を返す", (missingKey) => {
  // 必須 4 キーそれぞれを 1 つずつ欠いた 4 ケースで欠落キー検出を pin down
  const dict = fullDict().filter((e) => e.key.value !== missingKey);

  const result = InlineImageDict.findMissingRequiredKey(dict, false);

  expect(result.some).toBe(true);
  if (result.some) {
    expect(result.value).toBe(missingKey);
  }
});

test("imageMask=false で Width と Height が両方欠落のとき some('Width') を返す（先頭優先）", () => {
  // 検査順序の決定性: Width → Height → BPC → ColorSpace で先頭が優先される
  const dict = [
    makeEntry("BitsPerComponent"),
    makeEntry("ColorSpace", [nameToken("DeviceGray")]),
  ];

  const result = InlineImageDict.findMissingRequiredKey(dict, false);

  expect(result.some).toBe(true);
  if (result.some) {
    expect(result.value).toBe("Width");
  }
});

test("imageMask=false で Height のみ欠落のとき some('Height') を返す", () => {
  // 検査順序の 2 番目で初めて欠落するケース
  const dict = [
    makeEntry("Width"),
    makeEntry("BitsPerComponent"),
    makeEntry("ColorSpace", [nameToken("DeviceGray")]),
  ];

  const result = InlineImageDict.findMissingRequiredKey(dict, false);

  expect(result.some).toBe(true);
  if (result.some) {
    expect(result.value).toBe("Height");
  }
});

test("imageMask=false で BitsPerComponent のみ欠落のとき some('BitsPerComponent') を返す", () => {
  // 検査順序の 3 番目で初めて欠落するケース
  const dict = [
    makeEntry("Width"),
    makeEntry("Height"),
    makeEntry("ColorSpace", [nameToken("DeviceGray")]),
  ];

  const result = InlineImageDict.findMissingRequiredKey(dict, false);

  expect(result.some).toBe(true);
  if (result.some) {
    expect(result.value).toBe("BitsPerComponent");
  }
});

test("imageMask=true で Width が欠落のとき some('Width') を返す", () => {
  // stencil mask 例外でも Width は依然必須
  const dict = [makeEntry("Height")];

  const result = InlineImageDict.findMissingRequiredKey(dict, true);

  expect(result.some).toBe(true);
  if (result.some) {
    expect(result.value).toBe("Width");
  }
});

test("imageMask=true で Height が欠落のとき some('Height') を返す", () => {
  // stencil mask の Width 後に Height が検出される
  const dict = [makeEntry("Width")];

  const result = InlineImageDict.findMissingRequiredKey(dict, true);

  expect(result.some).toBe(true);
  if (result.some) {
    expect(result.value).toBe("Height");
  }
});

test("空 dict × imageMask=false で some('Width') を返す（先頭の必須キーから検査）", () => {
  // 空入力でも検査順 1 番目の Width を返す
  const result = InlineImageDict.findMissingRequiredKey([], false);

  expect(result.some).toBe(true);
  if (result.some) {
    expect(result.value).toBe("Width");
  }
});

test("空 dict × imageMask=true で some('Width') を返す", () => {
  // stencil 経路でも先頭は Width
  const result = InlineImageDict.findMissingRequiredKey([], true);

  expect(result.some).toBe(true);
  if (result.some) {
    expect(result.value).toBe("Width");
  }
});

test("略号のまま入力（normalize 未経由）すると some('Width') を返す（呼び出し前提の pin down）", () => {
  // findMissingRequiredKey は完全名のみ知っているため略号 /W は欠落扱いになる
  // 略号→完全名展開は normalize の責務であることを明示する
  const dict = [
    makeEntry("W"),
    makeEntry("H"),
    makeEntry("BPC"),
    makeEntry("CS", [nameToken("G")]),
  ];

  const result = InlineImageDict.findMissingRequiredKey(dict, false);

  expect(result.some).toBe(true);
  if (result.some) {
    expect(result.value).toBe("Width");
  }
});

test("normalize 連鎖: 全略号 dict は完全名展開後に必須キー揃いと判定される", () => {
  // 略号→ normalize → findMissingRequiredKey の鎖を dict 側でも 1 件 pin down
  const dict = [
    makeEntry("W"),
    makeEntry("H"),
    makeEntry("BPC"),
    makeEntry("CS", [nameToken("G")]),
  ];

  const result = InlineImageDict.findMissingRequiredKey(
    InlineImageDict.normalize(dict),
    false,
  );

  expect(result.some).toBe(false);
});

test("normalize 連鎖: 混在パターン（完全名 W + 略号 H/BPC/CS）でも揃い", () => {
  // 略号と完全名の混在を normalize が均すと findMissingRequiredKey は none を返す
  const dict = [
    makeEntry("Width"),
    makeEntry("H"),
    makeEntry("BPC"),
    makeEntry("CS", [nameToken("G")]),
  ];

  const result = InlineImageDict.findMissingRequiredKey(
    InlineImageDict.normalize(dict),
    false,
  );

  expect(result.some).toBe(false);
});

test("normalize 連鎖: 混在パターン（完全名 Width + 略号 H + 完全名 BPC + 完全名 CS）でも揃い", () => {
  // 完全名と略号が交互に並んでも normalize で展開され必須キーが揃う
  const dict = [
    makeEntry("Width"),
    makeEntry("H"),
    makeEntry("BitsPerComponent"),
    makeEntry("ColorSpace", [nameToken("DeviceGray")]),
  ];

  const result = InlineImageDict.findMissingRequiredKey(
    InlineImageDict.normalize(dict),
    false,
  );

  expect(result.some).toBe(false);
});
