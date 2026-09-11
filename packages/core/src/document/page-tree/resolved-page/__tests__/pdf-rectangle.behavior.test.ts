import { expect, test } from "vitest";
import { PdfRectangle } from "../index";

test.each<{ label: string; input: PdfRectangle; expected: PdfRectangle }>([
  {
    label: "対角逆順 [612 792 0 0]",
    input: [612, 792, 0, 0],
    expected: [0, 0, 612, 792],
  },
  {
    label: "x のみ逆順 [612 0 0 792]",
    input: [612, 0, 0, 792],
    expected: [0, 0, 612, 792],
  },
  {
    label: "y のみ逆順 [0 792 612 0]",
    input: [0, 792, 612, 0],
    expected: [0, 0, 612, 792],
  },
  {
    label: "負座標の対角逆順 [100 200 -10 -20]",
    input: [100, 200, -10, -20],
    expected: [-10, -20, 100, 200],
  },
  {
    label: "real 混在の対角逆順 [612.25 792 0 0.5]",
    input: [612.25, 792, 0, 0.5],
    expected: [0, 0.5, 612.25, 792],
  },
  {
    label: "高さ 0 かつ x 逆順 [100 50 0 50]",
    input: [100, 50, 0, 50],
    expected: [0, 50, 100, 50],
  },
])("PdfRectangle.normalize は $label を左下・右上の順に並べ替える", ({
  input,
  expected,
}) => {
  expect(PdfRectangle.normalize(input)).toEqual(expected);
});

test.each<{ label: string; input: PdfRectangle }>([
  { label: "正規形 [0 0 612 792]", input: [0, 0, 612, 792] },
  { label: "負座標の正規形 [-10 -20 100 200]", input: [-10, -20, 100, 200] },
  {
    label: "real 混在の正規形 [0 0.5 612.25 792]",
    input: [0, 0.5, 612.25, 792],
  },
  { label: "全要素 0 の退化矩形 [0 0 0 0]", input: [0, 0, 0, 0] },
  { label: "同一点の退化矩形 [10 10 10 10]", input: [10, 10, 10, 10] },
  { label: "幅 0 の退化矩形 [10 0 10 100]", input: [10, 0, 10, 100] },
])("PdfRectangle.normalize は $label をそのままの値で返す", ({ input }) => {
  expect(PdfRectangle.normalize(input)).toEqual(input);
});

test("PdfRectangle.normalize は入力配列を変更せず、新しい配列を返す", () => {
  const input: PdfRectangle = [612, 792, 0, 0];
  const result = PdfRectangle.normalize(input);
  expect(input).toEqual([612, 792, 0, 0]);
  expect(result).not.toBe(input);
});

test("PdfRectangle.normalize は正規化済みの結果をもう一度渡しても同じ値を返す（べき等）", () => {
  const once = PdfRectangle.normalize([612, 792, 0, 0]);
  expect(PdfRectangle.normalize(once)).toEqual(once);
});
