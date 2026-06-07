import { expect, test } from "vitest";
import { Matrix } from "../../matrix";
import { TextObject } from "../../text-object";

// active=true の任意 TextObject を生で組むヘルパ（dirty state 構築用）
const buildActive = (
  textMatrix: readonly number[],
  textLineMatrix: readonly number[],
): TextObject =>
  ({
    active: true,
    textMatrix,
    textLineMatrix,
  }) as TextObject;

// --- translateLine: 正常系（絶対配置） ---
test("translateLine(begin, 72, 720) は両 matrix を [1,0,0,1,72,720] にする", () => {
  const next = TextObject.translateLine(TextObject.begin(), 72, 720);
  expect(next.textMatrix).toEqual([1, 0, 0, 1, 72, 720]);
  expect(next.textLineMatrix).toEqual([1, 0, 0, 1, 72, 720]);
});

// --- translateLine: 正常系（相対累積 / 三角測量で一般化） ---
test("translateLine は現 textLineMatrix を基準に累積する（[..72,720]+(0,-14)=[..72,706]）", () => {
  const state = buildActive([1, 0, 0, 1, 72, 720], [1, 0, 0, 1, 72, 720]);
  const next = TextObject.translateLine(state, 0, -14);
  expect(next.textMatrix).toEqual([1, 0, 0, 1, 72, 706]);
  expect(next.textLineMatrix).toEqual([1, 0, 0, 1, 72, 706]);
});

// --- translateLine: 乗算順検証（非可換ケース） ---
// 平行移動同士だと左右を入れ替えても同結果になり向き誤りを検出できない。
// スケールを含む Tlm を使い multiply(translation, Tlm) の向きを固定する。
// translate(5,7) × [2,0,0,2,10,20] = [2,0,0,2,20,34]（逆順なら [2,0,0,2,15,27]）
test("translateLine は multiply(translation, Tlm) の向きで計算する（非可換で検証）", () => {
  const state = buildActive([9, 0, 0, 9, 99, 99], [2, 0, 0, 2, 10, 20]);
  const next = TextObject.translateLine(state, 5, 7);
  expect(next.textMatrix).toEqual([2, 0, 0, 2, 20, 34]);
  expect(next.textLineMatrix).toEqual([2, 0, 0, 2, 20, 34]);
});

// --- translateLine: 境界値（ゼロ移動） ---
// translate(0,0) は identity。Tlm' = Tlm（不変）、Tm' = Tlm（元 Tm が異なれば Tlm にリセット）。
test("translateLine(state, 0, 0) は Tlm を保ち Tm を Tlm に揃え、新インスタンスを返す", () => {
  const state = buildActive([5, 0, 0, 5, 1, 2], [1, 0, 0, 1, 72, 720]);
  const next = TextObject.translateLine(state, 0, 0);
  expect(next.textLineMatrix).toEqual([1, 0, 0, 1, 72, 720]); // Tlm は不変
  expect(next.textMatrix).toEqual([1, 0, 0, 1, 72, 720]); // Tm は Tlm に設定（元 [5,..] からリセット）
  expect(next).not.toBe(state); // 新インスタンス（別参照）
});

// --- translateLine: エッジケース（負値） ---
test("translateLine は負値の平行移動を正しく累積する（[..72,720]+(-14,-14)=[..58,706]）", () => {
  const state = buildActive([1, 0, 0, 1, 72, 720], [1, 0, 0, 1, 72, 720]);
  const next = TextObject.translateLine(state, -14, -14);
  expect(next.textMatrix).toEqual([1, 0, 0, 1, 58, 706]);
  expect(next.textLineMatrix).toEqual([1, 0, 0, 1, 58, 706]);
});

// --- translateLine: 不変性 ---
test("translateLine は元 state を mutate しない", () => {
  const state = buildActive([1, 0, 0, 1, 72, 720], [1, 0, 0, 1, 72, 720]);
  TextObject.translateLine(state, 0, -14);
  expect(state.textMatrix).toEqual([1, 0, 0, 1, 72, 720]);
  expect(state.textLineMatrix).toEqual([1, 0, 0, 1, 72, 720]);
});

// --- translateLine: active 保持（active=true / false 双方） ---
test("translateLine は active を引き継ぐ（true のまま）", () => {
  const next = TextObject.translateLine(TextObject.begin(), 1, 1);
  expect(next.active).toBe(true);
});
test("translateLine は active を引き継ぐ（inactive は false のまま）", () => {
  const next = TextObject.translateLine(TextObject.inactive(), 1, 1);
  expect(next.active).toBe(false);
});

// --- setMatrix: 正常系（上書き） ---
test("setMatrix(state, [2,0,0,2,10,20]) は両 matrix を [2,0,0,2,10,20] にする", () => {
  const m = Matrix.create(2, 0, 0, 2, 10, 20);
  const next = TextObject.setMatrix(TextObject.begin(), m);
  expect(next.textMatrix).toEqual([2, 0, 0, 2, 10, 20]);
  expect(next.textLineMatrix).toEqual([2, 0, 0, 2, 10, 20]);
});

// --- setMatrix: べき等性 ---
test("setMatrix は同一 matrix の再適用で同値（決定的上書き）", () => {
  const m = Matrix.create(2, 0, 0, 2, 10, 20);
  const once = TextObject.setMatrix(TextObject.begin(), m);
  const twice = TextObject.setMatrix(once, m);
  expect(twice.textMatrix).toEqual(once.textMatrix);
  expect(twice.textLineMatrix).toEqual(once.textLineMatrix);
});

// --- setMatrix: 不変性 / active 保持 ---
test("setMatrix は元 state を mutate せず active を引き継ぐ", () => {
  const state = buildActive([1, 0, 0, 1, 0, 0], [1, 0, 0, 1, 0, 0]);
  const next = TextObject.setMatrix(state, Matrix.create(2, 0, 0, 2, 10, 20));
  expect(state.textMatrix).toEqual([1, 0, 0, 1, 0, 0]); // 元 state は不変
  expect(state.textLineMatrix).toEqual([1, 0, 0, 1, 0, 0]);
  expect(next).not.toBe(state); // 新インスタンス
  expect(next.active).toBe(true); // active 引き継ぎ
});
test("setMatrix は active を引き継ぐ（inactive は false のまま）", () => {
  const next = TextObject.setMatrix(
    TextObject.inactive(),
    Matrix.create(2, 0, 0, 2, 10, 20),
  );
  expect(next.active).toBe(false);
});
