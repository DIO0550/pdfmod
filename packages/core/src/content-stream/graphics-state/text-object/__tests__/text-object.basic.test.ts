import { expect, test } from "vitest";
import { Matrix } from "../../matrix";
import { TextObject } from "../../text-object";

test("inactive() は active=false で両 matrix が identity の TextObject を返す", () => {
  const state = TextObject.inactive();
  expect(state.active).toBe(false);
  expect(state.textMatrix).toEqual(Matrix.identity());
  expect(state.textLineMatrix).toEqual(Matrix.identity());
});

test("begin() は active=true で両 matrix が identity の TextObject を返す", () => {
  const state = TextObject.begin();
  expect(state.active).toBe(true);
  expect(state.textMatrix).toEqual(Matrix.identity());
  expect(state.textLineMatrix).toEqual(Matrix.identity());
});

test("end(active) は active=false に戻し両 matrix を identity に戻す", () => {
  const active = TextObject.begin();
  const ended = TextObject.end(active);
  expect(ended.active).toBe(false);
  expect(ended.textMatrix).toEqual(Matrix.identity());
  expect(ended.textLineMatrix).toEqual(Matrix.identity());
});

test("end は非 identity matrix を持つ state からも matrix を identity に戻す", () => {
  const dirty = {
    active: true,
    textMatrix: [2, 0, 0, 2, 10, 20] as const,
    textLineMatrix: [3, 0, 0, 3, 30, 40] as const,
  } as unknown as TextObject;
  const ended = TextObject.end(dirty);
  expect(ended.active).toBe(false);
  expect(ended.textMatrix).toEqual(Matrix.identity());
  expect(ended.textLineMatrix).toEqual(Matrix.identity());
});

test("end(inactive) は冪等で active=false かつ両 matrix が identity のままを返す", () => {
  const ended = TextObject.end(TextObject.inactive());
  expect(ended.active).toBe(false);
  expect(ended.textMatrix).toEqual(Matrix.identity());
  expect(ended.textLineMatrix).toEqual(Matrix.identity());
});

test("isActive(begin()) は true を返す", () => {
  expect(TextObject.isActive(TextObject.begin())).toBe(true);
});

test("isActive(inactive()) は false を返す", () => {
  expect(TextObject.isActive(TextObject.inactive())).toBe(false);
});

test("isActive(end(begin())) は false を返す", () => {
  expect(TextObject.isActive(TextObject.end(TextObject.begin()))).toBe(false);
});
