// 本ファイルは深度 3 以上のネスト（none / some(dictionary) / some(name) 混在）で
// MarkedContentStack の LIFO 順序・全件取り出し・元 stack 不変・永続性が
// 維持されることを検証する。
// stack.basic.test.ts は深度 2 まで、stack.pop-empty.test.ts は深度 0 起点の
// pop = none を担当済み。本ファイルは深度 3 を全件 pop し切った結果としての
// none と、深度 4 による三角測量を担当する点が差分。
import { assert, expect, test } from "vitest";
import type {
  PdfDictionary,
  PdfName,
} from "../../../../pdf/types/pdf-types/index";
import { none, some } from "../../../../utils/option/index";
import { type MarkedContentEntry, MarkedContentStack } from "../index";

const artifactTag: PdfName = { type: "name", value: "Artifact" };
const spanTag: PdfName = { type: "name", value: "Span" };
const linkTag: PdfName = { type: "name", value: "Link" };
const figureTag: PdfName = { type: "name", value: "Figure" };
const propertyName: PdfName = { type: "name", value: "P1" };
const mcidDict: PdfDictionary = {
  type: "dictionary",
  entries: new Map([["MCID", { type: "integer", value: 0 }]]),
};

// 実 PDF の 3 段ネストを模した 3 バリアント混在の entry 群
// 積む順（外側 → 内側）: outer(none) → middle(dict) → inner(name)
const outerBmc: MarkedContentEntry = { tag: artifactTag, properties: none };
const middleBdcDict: MarkedContentEntry = {
  tag: spanTag,
  properties: some(mcidDict),
};
const innerBdcName: MarkedContentEntry = {
  tag: linkTag,
  properties: some(propertyName),
};
// 深度 4 の三角測量用（3 が特別扱いされていないことの確認）
const fourthBmc: MarkedContentEntry = { tag: figureTag, properties: none };

/**
 * entries を先頭から順に push した stack を返す（外側 → 内側の順で渡す）。
 * 中間 stack は返さないため、中間 stack の検査が必要な test では
 * push を直接連鎖させる。
 *
 * ループの書き方は emc.basic.test.ts の buildContext（let で受けた stack を
 * for...of で push し直す形）を踏襲する。ただし同ヘルパは properties: none
 * 固定で 3 バリアント混在を表現できないため、MarkedContentEntry を直接
 * 受け取る形で新規定義する。
 */
const pushAll = (
  entries: ReadonlyArray<MarkedContentEntry>,
): MarkedContentStack => {
  let stack = MarkedContentStack.create();
  for (const entry of entries) {
    stack = MarkedContentStack.push(stack, entry);
  }
  return stack;
};

test("3 バリアント混在の entry を 3 回 push すると depth が 3 になる", () => {
  // BMC(none) → BDC(dict) → BDC(name) の 3 段ネストで depth が 3 まで積み上がること
  const s3 = pushAll([outerBmc, middleBdcDict, innerBdcName]);

  expect(MarkedContentStack.depth(s3)).toBe(3);
});

test("深度 3 の pop は LIFO で inner → middle → outer の順に全件取り出せる", () => {
  // 3 段ネストの巻き戻しが逆順になり、各段で push した entry の同一参照が返ること
  const s3 = pushAll([outerBmc, middleBdcDict, innerBdcName]);

  const first = MarkedContentStack.pop(s3);
  assert(first.some);
  expect(first.value.popped).toBe(innerBdcName);

  const second = MarkedContentStack.pop(first.value.stack);
  assert(second.some);
  expect(second.value.popped).toBe(middleBdcDict);

  const third = MarkedContentStack.pop(second.value.stack);
  assert(third.some);
  expect(third.value.popped).toBe(outerBmc);
});

test("深度 3 を全件 pop し切った stack は depth 0 で pop が none を返す", () => {
  // 3 回の pop で過不足なく空になり、4 回目の pop が none になること
  const s3 = pushAll([outerBmc, middleBdcDict, innerBdcName]);

  const first = MarkedContentStack.pop(s3);
  assert(first.some);
  const second = MarkedContentStack.pop(first.value.stack);
  assert(second.some);
  const third = MarkedContentStack.pop(second.value.stack);
  assert(third.some);

  expect(MarkedContentStack.depth(third.value.stack)).toBe(0);
  expect(MarkedContentStack.pop(third.value.stack)).toEqual({ some: false });
});

test("深度 4 まで積んでも depth が 4 で pop の LIFO 順が保たれる", () => {
  // 深度 3 が特別扱いされていないこと（三角測量による一般化の確認）
  const s4 = pushAll([outerBmc, middleBdcDict, innerBdcName, fourthBmc]);
  expect(MarkedContentStack.depth(s4)).toBe(4);

  const first = MarkedContentStack.pop(s4);
  assert(first.some);
  expect(first.value.popped.tag.value).toBe("Figure");

  const second = MarkedContentStack.pop(first.value.stack);
  assert(second.some);
  expect(second.value.popped.tag.value).toBe("Link");

  const third = MarkedContentStack.pop(second.value.stack);
  assert(third.some);
  expect(third.value.popped.tag.value).toBe("Span");

  const fourth = MarkedContentStack.pop(third.value.stack);
  assert(fourth.some);
  expect(fourth.value.popped.tag.value).toBe("Artifact");
});

test("深度 3 の pop 系列を通しても元 stack と中間 stack の depth が変化しない", () => {
  // pop が非破壊であり、s1=1 / s2=2 / s3=3 が pop 後も維持されること
  const s1 = MarkedContentStack.push(MarkedContentStack.create(), outerBmc);
  const s2 = MarkedContentStack.push(s1, middleBdcDict);
  const s3 = MarkedContentStack.push(s2, innerBdcName);

  const first = MarkedContentStack.pop(s3);
  assert(first.some);
  const second = MarkedContentStack.pop(first.value.stack);
  assert(second.some);
  const third = MarkedContentStack.pop(second.value.stack);
  assert(third.some);

  expect(MarkedContentStack.depth(s1)).toBe(1);
  expect(MarkedContentStack.depth(s2)).toBe(2);
  expect(MarkedContentStack.depth(s3)).toBe(3);
});

test("深度 3 の各 pop は入力 stack と別参照の stack を返す", () => {
  // 各段の pop が新しい配列を生成し、入力 stack を使い回さないこと
  const s3 = pushAll([outerBmc, middleBdcDict, innerBdcName]);

  const first = MarkedContentStack.pop(s3);
  assert(first.some);
  expect(first.value.stack).not.toBe(s3);

  const second = MarkedContentStack.pop(first.value.stack);
  assert(second.some);
  expect(second.value.stack).not.toBe(first.value.stack);

  const third = MarkedContentStack.pop(second.value.stack);
  assert(third.some);
  expect(third.value.stack).not.toBe(second.value.stack);
});

test("深度 2 の stack に 3 件目を push しても元 stack は depth 2 のまま別参照", () => {
  // push が深度 3 でも非破壊であること
  const s1 = MarkedContentStack.push(MarkedContentStack.create(), outerBmc);
  const s2 = MarkedContentStack.push(s1, middleBdcDict);

  const s3 = MarkedContentStack.push(s2, innerBdcName);

  expect(MarkedContentStack.depth(s2)).toBe(2);
  expect(s3).not.toBe(s2);
});

test("深度 3 から 1 回 pop した中間 stack に別 entry を push しても元の系列は影響を受けない", () => {
  // 永続データ構造としての分岐独立性（分岐先 depth 3 かつ元 s3 の pop は元 entry を返す）
  const s3 = pushAll([outerBmc, middleBdcDict, innerBdcName]);
  const popped = MarkedContentStack.pop(s3);
  assert(popped.some);

  const branched = MarkedContentStack.push(popped.value.stack, fourthBmc);

  expect(MarkedContentStack.depth(branched)).toBe(3);
  expect(MarkedContentStack.depth(s3)).toBe(3);
  const reread = MarkedContentStack.pop(s3);
  assert(reread.some);
  expect(reread.value.popped).toBe(innerBdcName);
});
