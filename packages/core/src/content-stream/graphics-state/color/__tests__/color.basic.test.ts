import { expect, test } from "vitest";
import { Color } from "../../color";
import { ColorSpace } from "../../color-space";

test.each([[0], [0.5], [1]])("Color.gray(%s) は gray color を返す", (g) => {
  expect(Color.gray(g)).toEqual({ kind: "gray", g });
});

test.each([
  [0, 0, 0],
  [1, 0.5, 0.25],
])("Color.rgb(%s, %s, %s) は rgb color を返す", (r, g, b) => {
  expect(Color.rgb(r, g, b)).toEqual({ kind: "rgb", r, g, b });
});

test.each([
  [0, 0, 0, 0],
  [0.1, 0.2, 0.3, 0.4],
])("Color.cmyk(%s, %s, %s, %s) は cmyk color を返す", (c, m, y, k) => {
  expect(Color.cmyk(c, m, y, k)).toEqual({ kind: "cmyk", c, m, y, k });
});

test("Color.defaultBlack() は kind:gray, g:0 を返す", () => {
  expect(Color.defaultBlack()).toEqual({ kind: "gray", g: 0 });
});

test.each([
  [Color.gray(0.5), ColorSpace.deviceGray()],
  [Color.rgb(1, 0, 0), ColorSpace.deviceRGB()],
  [Color.cmyk(0, 1, 1, 0), ColorSpace.deviceCMYK()],
] as const)("Color.colorSpaceOf(%j) は対応する ColorSpace を返す", (color, expected) => {
  expect(Color.colorSpaceOf(color)).toBe(expected);
});

test("Color.rgb は範囲外の値もそのまま保持する (clamp / throw しない仕様の固定)", () => {
  expect(Color.rgb(-0.1, 1.2, 2)).toEqual({
    kind: "rgb",
    r: -0.1,
    g: 1.2,
    b: 2,
  });
});
