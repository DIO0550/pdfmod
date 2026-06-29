import { expect, test } from "vitest";
import { none, some } from "../../../utils/option/index";
import { StringArrayEx } from "../index";

// firstMissing: 必須キーが全て揃っているとき欠落なしを示す none を返すこと
test("firstMissing: 全て揃っているとき none を返す", () => {
  expect(
    StringArrayEx.firstMissing(
      ["Width", "Height", "BitsPerComponent", "ColorSpace"],
      ["Width", "Height", "BitsPerComponent", "ColorSpace"],
    ),
  ).toBe(none);
});

// firstMissing: 先頭の必須キーが欠落しているとき走査順最初の欠落キーを返すこと
test("firstMissing: 先頭の必須キーが欠落しているとき some(先頭キー) を返す", () => {
  expect(
    StringArrayEx.firstMissing(
      ["Height", "BitsPerComponent", "ColorSpace"],
      ["Width", "Height", "BitsPerComponent", "ColorSpace"],
    ),
  ).toStrictEqual(some("Width"));
});

// firstMissing: 中間の必須キーが欠落しているとき走査順最初の欠落キーを返すこと
test("firstMissing: 中間の必須キーが欠落しているとき some(中間キー) を返す", () => {
  expect(
    StringArrayEx.firstMissing(
      ["Width", "Height", "ColorSpace"],
      ["Width", "Height", "BitsPerComponent", "ColorSpace"],
    ),
  ).toStrictEqual(some("BitsPerComponent"));
});

// firstMissing: 末尾の必須キーが欠落しているとき走査順最後の欠落キーを返すこと
test("firstMissing: 末尾の必須キーが欠落しているとき some(末尾キー) を返す", () => {
  expect(
    StringArrayEx.firstMissing(
      ["Width", "Height", "BitsPerComponent"],
      ["Width", "Height", "BitsPerComponent", "ColorSpace"],
    ),
  ).toStrictEqual(some("ColorSpace"));
});

// firstMissing: 複数欠落しているとき requiredKeys の走査順で最初の欠落キーのみを返すこと
test("firstMissing: 複数欠落しているとき requiredKeys 順で最初のキーを返す", () => {
  expect(
    StringArrayEx.firstMissing(
      ["Height", "ColorSpace"],
      ["Width", "Height", "BitsPerComponent", "ColorSpace"],
    ),
  ).toStrictEqual(some("Width"));
});

// containsAll: 必須キーが全て揃っているとき true を返すこと
test("containsAll: 全て揃っているとき true を返す", () => {
  expect(
    StringArrayEx.containsAll(
      ["Width", "Height", "BitsPerComponent", "ColorSpace"],
      ["Width", "Height", "BitsPerComponent", "ColorSpace"],
    ),
  ).toBe(true);
});

// containsAll: 必須キーが 1 つ欠落しているとき false を返すこと
test("containsAll: 1 つ欠落しているとき false を返す", () => {
  expect(
    StringArrayEx.containsAll(
      ["Width", "Height", "BitsPerComponent"],
      ["Width", "Height", "BitsPerComponent", "ColorSpace"],
    ),
  ).toBe(false);
});

// containsAll: 必須キーがすべて欠落しているとき false を返すこと
test("containsAll: 全欠落のとき false を返す", () => {
  expect(
    StringArrayEx.containsAll(
      [],
      ["Width", "Height", "BitsPerComponent", "ColorSpace"],
    ),
  ).toBe(false);
});

// allMissing: 全て揃っているとき欠落なしを示す空配列を返すこと
test("allMissing: 全て揃っているとき空配列を返す", () => {
  expect(
    StringArrayEx.allMissing(
      ["Width", "Height", "BitsPerComponent", "ColorSpace"],
      ["Width", "Height", "BitsPerComponent", "ColorSpace"],
    ),
  ).toEqual([]);
});

// allMissing: 単独欠落のとき該当キー 1 件のみを含む配列を返すこと
test("allMissing: 単独欠落のとき該当キー 1 件の配列を返す", () => {
  expect(
    StringArrayEx.allMissing(
      ["Width", "BitsPerComponent", "ColorSpace"],
      ["Width", "Height", "BitsPerComponent", "ColorSpace"],
    ),
  ).toEqual(["Height"]);
});

// allMissing: 複数欠落のとき requiredKeys の走査順で欠落キー一覧を返すこと
test("allMissing: 複数欠落のとき requiredKeys 順の配列を返す", () => {
  expect(
    StringArrayEx.allMissing(
      ["Height", "ColorSpace"],
      ["Width", "Height", "BitsPerComponent", "ColorSpace"],
    ),
  ).toEqual(["Width", "BitsPerComponent"]);
});

// 戻り値型: firstMissing が返す some の中身は string 型であること
test("firstMissing: some の中身が string 型である", () => {
  const result = StringArrayEx.firstMissing(["Width"], ["Width", "Height"]);
  // 構造一致で some("Height") を pin down（value の型は TypeScript で string に narrowing 済み）
  expect(result).toStrictEqual(some("Height"));
});

// 戻り値型: firstMissing が none を返すときは utils/option の singleton と参照一致すること
test("firstMissing: none は singleton（参照比較で一致）", () => {
  const result = StringArrayEx.firstMissing(["Width"], ["Width"]);
  expect(result).toBe(none);
});
