import { expect, test } from "vitest";
import { TextObject } from "../index";

// active=true の任意 TextObject を生で組むヘルパ（dirty state 構築用）
const buildActive = (
  textMatrix: readonly [number, number, number, number, number, number],
  textLineMatrix: readonly [number, number, number, number, number, number],
): TextObject =>
  ({
    active: true,
    textMatrix,
    textLineMatrix,
  }) as TextObject;

// active=false の任意 TextObject を生で組むヘルパ（inactive dirty state 構築用）
const buildInactive = (
  textMatrix: readonly [number, number, number, number, number, number],
  textLineMatrix: readonly [number, number, number, number, number, number],
): TextObject =>
  ({
    active: false,
    textMatrix,
    textLineMatrix,
  }) as TextObject;

// 1. 水平移動: textMatrix が動き textLineMatrix は不変
test("translateText(state, 10, 0) は textMatrix を水平移動し textLineMatrix を変更しない", () => {
  const state = buildActive([1, 0, 0, 1, 72, 720], [1, 0, 0, 1, 72, 720]);
  const next = TextObject.translateText(state, 10, 0);
  expect(next.textMatrix).toEqual([1, 0, 0, 1, 82, 720]);
  expect(next.textLineMatrix).toEqual([1, 0, 0, 1, 72, 720]);
});

// 2. 非可換性 / 一般化: translate(5,-3) × Tm (scale を含む Tm で向きを固定)
// 平行移動同士だと左右を入れ替えても同結果になり向き誤りを検出できない。
// scale を含む Tm を使い multiply(translation, Tm) の向きを固定する。
// translate(5,-3) × [2,0,0,2,10,20] = [2,0,0,2,20,14]（逆順なら [2,0,0,2,15,17]）
test("translateText(state, 5, -3) は textMatrix を translate(5,-3) × Tm にする", () => {
  const state = buildActive([2, 0, 0, 2, 10, 20], [9, 0, 0, 9, 99, 99]);
  const next = TextObject.translateText(state, 5, -3);
  expect(next.textMatrix).toEqual([2, 0, 0, 2, 20, 14]);
  expect(next.textLineMatrix).toEqual([9, 0, 0, 9, 99, 99]);
});

// 3. no-op 相当: tx=ty=0 で textMatrix 不変 (Tm != Tlm の dirty state で
//    translateLine が Tm を Tlm にリセットするのに対し translateText は Tm を保持する差分を固定)
test("translateText(state, 0, 0) は textMatrix を変更しない (no-op 相当, Tm は Tlm にリセットされない)", () => {
  const state = buildActive([5, 0, 0, 5, 1, 2], [1, 0, 0, 1, 72, 720]);
  const next = TextObject.translateText(state, 0, 0);
  expect(next.textMatrix).toEqual([5, 0, 0, 5, 1, 2]);
  expect(next.textLineMatrix).toEqual([1, 0, 0, 1, 72, 720]);
  expect(next).not.toBe(state);
});

// 4. active フラグ保持 (active=true / inactive 双方, active のみ検証)
test("translateText は active フラグを保持する (active=true)", () => {
  const next = TextObject.translateText(TextObject.begin(), 1, 1);
  expect(next.active).toBe(true);
});
test("translateText は active フラグを保持する (inactive は false のまま)", () => {
  const next = TextObject.translateText(TextObject.inactive(), 1, 1);
  expect(next.active).toBe(false);
});

// 5. 元 state の不変性
test("translateText は引数 state の textMatrix / textLineMatrix を変更しない", () => {
  const state = buildActive([1, 0, 0, 1, 72, 720], [1, 0, 0, 1, 72, 720]);
  const next = TextObject.translateText(state, 5, -3);
  expect(state.textMatrix).toEqual([1, 0, 0, 1, 72, 720]);
  expect(state.textLineMatrix).toEqual([1, 0, 0, 1, 72, 720]);
  expect(next).not.toBe(state);
});

// 6. inactive state (active=false) で textMatrix のみ移動・active=false 維持
test("translateText は inactive state でも textMatrix のみ移動し active=false を維持する", () => {
  const state = buildInactive([3, 0, 0, 3, 4, 5], [6, 0, 0, 6, 7, 8]);
  const next = TextObject.translateText(state, 7, 9);
  expect(next.textMatrix).toEqual([3, 0, 0, 3, 25, 32]);
  expect(next.textLineMatrix).toEqual([6, 0, 0, 6, 7, 8]);
  expect(next.active).toBe(false);
});

// 7. textLineMatrix 据え置き明示検証 (参照据え置き: toBe(state.textLineMatrix))
// (1)(2) の toEqual 値比較と役割を分け、防御コピーせず参照を引き継ぐ実装方針を固定
// (translateLine との差分を明示)
test("translateText の戻り値の textLineMatrix は引数と同一参照で据え置かれる", () => {
  const state = buildActive([2, 0, 0, 2, 10, 20], [9, 0, 0, 9, 99, 99]);
  const next = TextObject.translateText(state, 5, -3);
  expect(next.textLineMatrix).toBe(state.textLineMatrix);
});
