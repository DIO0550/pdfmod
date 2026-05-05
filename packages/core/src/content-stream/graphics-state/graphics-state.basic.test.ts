import { expect, test } from "vitest";
import { GraphicsState, LineCap, LineJoin, Matrix } from "./index";

test("createはPDF仕様準拠のデフォルト値を返す", () => {
  const state = GraphicsState.create();
  expect(state).toEqual({
    ctm: Matrix.identity(),
    lineWidth: 1.0,
    lineCap: LineCap.create(0),
    lineJoin: LineJoin.create(0),
    miterLimit: 10.0,
  });
});

test("updateは指定したフィールドだけを書き換える", () => {
  const state = GraphicsState.create();
  const updated = GraphicsState.update(state, { lineWidth: 2.0 });
  expect(updated.lineWidth).toBe(2.0);
});

test("updateは未指定フィールドを保持する", () => {
  const state = GraphicsState.create();
  const updated = GraphicsState.update(state, { lineWidth: 2.0 });
  expect(updated.ctm).toBe(state.ctm);
  expect(updated.lineCap).toBe(state.lineCap);
  expect(updated.lineJoin).toBe(state.lineJoin);
  expect(updated.miterLimit).toBe(state.miterLimit);
});

test("updateは元のstateを変更しない", () => {
  const state = GraphicsState.create();
  GraphicsState.update(state, { lineWidth: 2.0 });
  expect(state.lineWidth).toBe(1.0);
});

test("updateは新しいインスタンスを返す", () => {
  const state = GraphicsState.create();
  const updated = GraphicsState.update(state, { lineWidth: 2.0 });
  expect(updated).not.toBe(state);
});

test.each([
  ["lineWidth", { lineWidth: 3.5 }],
  ["lineCap", { lineCap: LineCap.create(1) }],
  ["lineJoin", { lineJoin: LineJoin.create(2) }],
  ["miterLimit", { miterLimit: 5.0 }],
  ["ctm", { ctm: Matrix.create(2, 0, 0, 2, 0, 0) }],
] as const)("update(state, %s) は該当フィールドだけ書き換える", (_label, partial) => {
  const state = GraphicsState.create();
  const updated = GraphicsState.update(state, partial);
  expect(updated).toEqual({ ...state, ...partial });
});

test("updateはundefinedの明示指定で既存フィールドを壊さない", () => {
  const state = GraphicsState.update(GraphicsState.create(), {
    lineWidth: 2.0,
    miterLimit: 5.0,
  });
  const updated = GraphicsState.update(state, {
    lineWidth: undefined,
    miterLimit: undefined,
  });
  expect(updated.lineWidth).toBe(2.0);
  expect(updated.miterLimit).toBe(5.0);
});
