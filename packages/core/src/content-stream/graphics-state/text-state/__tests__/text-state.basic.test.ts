import { expect, test } from "vitest";
import { none, some } from "../../../../utils/option/index";
import { TextRenderingMode, TextState } from "../../index";

test("createはPDF §9.3 デフォルト値を返す", () => {
  const state = TextState.create();
  expect(state).toEqual({
    charSpace: 0,
    wordSpace: 0,
    horizontalScaling: 100,
    leading: 0,
    fontName: none,
    fontSize: 0,
    renderingMode: TextRenderingMode.create(TextRenderingMode.FILL),
    rise: 0,
  });
});

test("updateは未指定フィールドを保持する", () => {
  const state = TextState.create();
  const updated = TextState.update(state, { charSpace: 2 });
  expect(updated.wordSpace).toBe(state.wordSpace);
  expect(updated.horizontalScaling).toBe(state.horizontalScaling);
  expect(updated.fontName).toBe(state.fontName);
  expect(updated.renderingMode).toBe(state.renderingMode);
});

test("updateは元のstateを変更しない", () => {
  const state = TextState.create();
  TextState.update(state, { charSpace: 2, fontName: some("F1") });
  expect(state.charSpace).toBe(0);
  expect(state.fontName).toBe(none);
});

test("updateは新しいインスタンスを返す", () => {
  const state = TextState.create();
  const updated = TextState.update(state, { charSpace: 2 });
  expect(updated).not.toBe(state);
});

test.each([
  ["charSpace", { charSpace: 3 }],
  ["wordSpace", { wordSpace: 5 }],
  ["horizontalScaling", { horizontalScaling: 90 }],
  ["leading", { leading: 12 }],
  ["fontName", { fontName: some("F1") }],
  ["fontSize", { fontSize: 14 }],
  [
    "renderingMode",
    { renderingMode: TextRenderingMode.create(TextRenderingMode.STROKE) },
  ],
  ["rise", { rise: 4 }],
] as const)("update(state, %s) は該当フィールドだけ書き換える", (_label, partial) => {
  const state = TextState.create();
  const updated = TextState.update(state, partial);
  expect(updated).toEqual({ ...state, ...partial });
});

test("updateはundefinedの明示指定で既存フィールドを壊さない", () => {
  const state = TextState.update(TextState.create(), { charSpace: 7 });
  const updated = TextState.update(state, { charSpace: undefined });
  expect(updated.charSpace).toBe(7);
});
