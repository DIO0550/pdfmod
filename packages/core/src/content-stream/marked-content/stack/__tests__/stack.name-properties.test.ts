// 本ファイルは MarkedContentStack.push を直接呼び、some(PdfName) の entry が
// push→pop の往復で参照・内容とも保持されること、および 3 バリアント
// (none / some(dictionary) / some(name)) が取り違えられないことを検証する。
// bdc.name.test.ts は bdcHandler が entry を「組み立てる」責務のテストで、
// その過程で stack 往復も間接的に通っている。本ファイルは handler を介さず
// stack 単体の「保持する」責務のみを見る点が差分。
import { assert, expect, test } from "vitest";
import type {
  PdfDictionary,
  PdfName,
} from "../../../../pdf/types/pdf-types/index";
import { none, some } from "../../../../utils/option/index";
import { type MarkedContentEntry, MarkedContentStack } from "../index";

// フィクスチャはモジュールスコープの const で定義する（beforeEach は使わない）
const spanTag: PdfName = { type: "name", value: "Span" };
const propertyName: PdfName = { type: "name", value: "P1" };
const emptyPropertyName: PdfName = { type: "name", value: "" };
const mcidDict: PdfDictionary = {
  type: "dictionary",
  entries: new Map([["MCID", { type: "integer", value: 0 }]]),
};

// `/Span BMC` 由来: properties なし
const bmcSpan: MarkedContentEntry = { tag: spanTag, properties: none };
// `/Span <</MCID 0>> BDC` 由来: インライン辞書
const bdcSpanDict: MarkedContentEntry = {
  tag: spanTag,
  properties: some(mcidDict),
};
// `/Span /P1 BDC` 由来: 名前参照（本ファイルの主対象。既存 fixture に存在しない）
const bdcSpanName: MarkedContentEntry = {
  tag: spanTag,
  properties: some(propertyName),
};
// `/Span / BDC` 由来: 空文字 name（境界値。bdcHandler は空文字 name を受理する）
// name は `/` 1 個で始まり次の区切り文字までが名前のため、空文字 name の表記は
// `/` 単独になる。`//` と書くと空文字 name 2 個にトークナイズされ operand 数が変わる。
const bdcSpanEmptyName: MarkedContentEntry = {
  tag: spanTag,
  properties: some(emptyPropertyName),
};

test("properties が some(name) の entry を push→pop すると同一参照で tag・properties とも保持される", () => {
  // 名前参照形 BDC entry が stack を往復しても浅いコピーされず同一参照で返り、
  // tag が /Span・properties が some(/P1) のまま（正規化も resource 解決もされない）こと。
  // popped の toBe / properties.value の toBe / tag・properties の内容 toEqual を
  // 1 test にまとめる（toBe が成立すれば内容一致は自動的に従うため、
  // 別 test に分けても独立に落ちることがなく分割の意味がないため）。
  // 同じ toBe 検証は dict バリアントでは stack.basic.test.ts / bdc.dict.test.ts が
  // 済ませており、name バリアントだけが未検証というギャップを埋める。
  // bdc.name.test.ts は同じ観測を handler 経由（bdcHandler が push した stack）で
  // 行っている。本 test は MarkedContentStack.push を直接呼ぶ点が差分。
  const stack = MarkedContentStack.push(
    MarkedContentStack.create(),
    bdcSpanName,
  );

  const result = MarkedContentStack.pop(stack);

  assert(result.some);
  expect(result.value.popped).toBe(bdcSpanName);
  assert(result.value.popped.properties.some);
  expect(result.value.popped.properties.value).toBe(propertyName);
  expect(result.value.popped.tag).toEqual({ type: "name", value: "Span" });
  expect(result.value.popped.properties.value).toEqual({
    type: "name",
    value: "P1",
  });
});

test("properties が空文字 name（`/` 単独）でも some のまま保持される", () => {
  // 空文字 name は falsy だが Option としては some のまま扱われる境界値。
  // bdc.name.test.ts は同じ境界入力を「handler が受理するか」の観点で見ている。
  // 本 test は「stack が some のまま保持するか」の観点で見る点が差分。
  const stack = MarkedContentStack.push(
    MarkedContentStack.create(),
    bdcSpanEmptyName,
  );

  const result = MarkedContentStack.pop(stack);

  assert(result.some);
  assert(result.value.popped.properties.some);
  expect(result.value.popped.properties.value).toEqual({
    type: "name",
    value: "",
  });
});

test("同一 tag で none と some(name) を積んでも pop 時に properties を取り違えない", () => {
  // tag が同一でも properties バリアントが entry ごとに独立して保持されること
  const s1 = MarkedContentStack.push(MarkedContentStack.create(), bmcSpan);
  const s2 = MarkedContentStack.push(s1, bdcSpanName);

  const first = MarkedContentStack.pop(s2);

  assert(first.some);
  expect(first.value.popped).toBe(bdcSpanName);
  assert(first.value.popped.properties.some);
  expect(first.value.popped.properties.value).toBe(propertyName);

  const second = MarkedContentStack.pop(first.value.stack);

  assert(second.some);
  expect(second.value.popped).toBe(bmcSpan);
  expect(second.value.popped.properties).toEqual({ some: false });
});

test("some(dict) と some(name) を隣接して積んでも pop 時に properties の型が入れ替わらない", () => {
  // dictionary バリアントと name バリアントが LIFO 位置ごとに正しく対応すること
  const s1 = MarkedContentStack.push(MarkedContentStack.create(), bdcSpanDict);
  const s2 = MarkedContentStack.push(s1, bdcSpanName);

  const upper = MarkedContentStack.pop(s2);

  assert(upper.some);
  assert(upper.value.popped.properties.some);
  expect(upper.value.popped.properties.value.type).toBe("name");

  const lower = MarkedContentStack.pop(upper.value.stack);

  assert(lower.some);
  assert(lower.value.popped.properties.some);
  expect(lower.value.popped.properties.value.type).toBe("dictionary");
});
