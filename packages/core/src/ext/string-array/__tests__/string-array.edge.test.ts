import { expect, test } from "vitest";
import { none, some } from "../../../utils/option/index";
import { StringArrayEx } from "../index";

// 境界値: 両方が空配列のときは「欠落なし」を示す none を返すこと
test("firstMissing: keys 空 + requiredKeys 空 のとき none を返す", () => {
  expect(StringArrayEx.firstMissing([], [])).toBe(none);
});

// 境界値: requiredKeys が空ならば走査対象なしで none を返すこと
test("firstMissing: keys 非空 + requiredKeys 空 のとき none を返す", () => {
  expect(StringArrayEx.firstMissing(["Width", "Height"], [])).toBe(none);
});

// 境界値: keys が空かつ requiredKeys が非空なら走査順最初のキーが欠落として返ること
test("firstMissing: keys 空 + requiredKeys 非空 のとき some(先頭) を返す", () => {
  expect(StringArrayEx.firstMissing([], ["Width", "Height"])).toStrictEqual(
    some("Width"),
  );
});

// 境界値: containsAll は両者空のとき vacuous truth で true を返すこと
test("containsAll: keys 空 + requiredKeys 空 のとき true を返す（vacuous truth）", () => {
  expect(StringArrayEx.containsAll([], [])).toBe(true);
});

// 境界値: containsAll は requiredKeys が空なら keys の中身に関係なく true を返すこと
test("containsAll: keys 非空 + requiredKeys 空 のとき true を返す", () => {
  expect(StringArrayEx.containsAll(["Width"], [])).toBe(true);
});

// 境界値: allMissing は requiredKeys が空なら欠落なしで空配列を返すこと
test("allMissing: requiredKeys 空 のとき空配列を返す", () => {
  expect(StringArrayEx.allMissing(["Width"], [])).toEqual([]);
});

// keys 側重複: PDF dict は重複キーを許容する仕様だが、存在判定は重複に依存しないこと
test("firstMissing: keys 側に重複があっても結果に影響しない", () => {
  expect(
    StringArrayEx.firstMissing(
      ["Width", "Width", "Height"],
      ["Width", "Height"],
    ),
  ).toBe(none);
});

// keys 側重複: containsAll も重複の有無に依らない充足判定であること
test("containsAll: keys 側に重複があっても充足判定に影響しない", () => {
  expect(
    StringArrayEx.containsAll(
      ["Width", "Width", "Height"],
      ["Width", "Height"],
    ),
  ).toBe(true);
});

// keys 側重複: allMissing は keys 側の重複に依存しないこと
test("allMissing: keys 側に重複があっても欠落一覧に影響しない", () => {
  expect(
    StringArrayEx.allMissing(["Width", "Width"], ["Width", "Height"]),
  ).toEqual(["Height"]);
});

// requiredKeys 側重複: 走査順序通り最初の欠落が返ること
test("firstMissing: requiredKeys 側に重複があるとき最初の欠落を返す", () => {
  expect(
    StringArrayEx.firstMissing(["Height"], ["Width", "Width", "Height"]),
  ).toStrictEqual(some("Width"));
});

// requiredKeys 側重複: 重複指定があっても結果に重複は出ないこと
test("containsAll: requiredKeys 側に重複があっても充足判定に影響しない", () => {
  expect(StringArrayEx.containsAll(["Width"], ["Width", "Width"])).toBe(true);
});

// requiredKeys 側重複: allMissing は重複指定でも 1 件にデデュープすること
test("allMissing: requiredKeys 側に重複があっても結果に重複を含めない", () => {
  expect(StringArrayEx.allMissing([], ["Width", "Width"])).toEqual(["Width"]);
});

// 大文字小文字: includes による厳密一致のため別キー扱いになること
test('firstMissing: "Width" と "width" は別キーとして扱う', () => {
  expect(StringArrayEx.firstMissing(["width"], ["Width"])).toStrictEqual(
    some("Width"),
  );
});

// 大文字小文字: containsAll も大文字小文字差を欠落として扱うこと
test("containsAll: 大文字小文字の不一致は欠落として扱う", () => {
  expect(StringArrayEx.containsAll(["width"], ["Width"])).toBe(false);
});

// 多数キー: ナイーブ O(n·m) 実装でも 16+ 件の必須キーで正しく動くこと
test("firstMissing: 16+ 件の必須キーでも線形走査で正しく動く", () => {
  const requiredKeys = [
    "K01",
    "K02",
    "K03",
    "K04",
    "K05",
    "K06",
    "K07",
    "K08",
    "K09",
    "K10",
    "K11",
    "K12",
    "K13",
    "K14",
    "K15",
    "K16",
    "K17",
    "K18",
  ];
  // K17 のみ欠落させ、走査順で K17 が返ることを確認する
  const keys = requiredKeys.filter((k) => k !== "K17");
  expect(StringArrayEx.firstMissing(keys, requiredKeys)).toStrictEqual(
    some("K17"),
  );
});

// 不変性: 純関数として 1 回目の戻り値を mutate しても 2 回目の結果は独立した新規配列であること。
// 戻り値型は ReadonlyArray<string> のため、テスト側で意図的に readonly を破ってから push する。
test("allMissing: 戻り値を mutate しても次回呼び出しに影響しない", () => {
  const first = StringArrayEx.allMissing(
    ["Width"],
    ["Width", "Height"],
  ) as string[];
  first.push("MUTATED");

  const second = StringArrayEx.allMissing(["Width"], ["Width", "Height"]);
  expect(second).toEqual(["Height"]);
});
