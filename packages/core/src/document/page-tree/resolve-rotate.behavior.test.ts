import { expect, test } from "vitest";
import type { InheritedAttrs } from "./inheritance-resolver";
import { makePageDict, makeRef } from "./page-tree-walker.test.helpers";
import { resolveRotate } from "./resolve-rotate";

const NO_INHERIT: InheritedAttrs = {};
const ref = makeRef(10, 0);

test("/Rotate キー不在・inherited.rotate undefined で 0 / warning none", () => {
  const dict = makePageDict({});
  const out = resolveRotate(dict, NO_INHERIT, NO_INHERIT, ref);
  expect(out).toEqual({ value: 0, warning: { some: false } });
});

test("/Rotate キー不在・inherited.rotate=90 で 90 / warning none", () => {
  const dict = makePageDict({});
  const inherited: InheritedAttrs = { rotate: 90 };
  const out = resolveRotate(dict, inherited, NO_INHERIT, ref);
  expect(out).toEqual({ value: 90, warning: { some: false } });
});

test("/Rotate キー不在・inherited.rotate=135 で 180 / warning none（projectRotate）", () => {
  const dict = makePageDict({});
  const inherited: InheritedAttrs = { rotate: 135 };
  const out = resolveRotate(dict, inherited, NO_INHERIT, ref);
  expect(out).toEqual({ value: 180, warning: { some: false } });
});

test("/Rotate キー不在・inherited.rotate=NaN で 0 / warning none", () => {
  const dict = makePageDict({});
  const inherited: InheritedAttrs = { rotate: Number.NaN };
  const out = resolveRotate(dict, inherited, NO_INHERIT, ref);
  expect(out).toEqual({ value: 0, warning: { some: false } });
});

test("/Rotate キー有り・pageLeaf.rotate undefined（非数値）で INVALID_ROTATE 警告", () => {
  const dict = makePageDict({ rotate: { type: "name", value: "Foo" } });
  const out = resolveRotate(dict, NO_INHERIT, NO_INHERIT, ref);
  expect(out.value).toBe(0);
  expect(out.warning.some).toBe(true);
});

test("/Rotate キー有り・90 で警告なし", () => {
  const dict = makePageDict({ rotate: { type: "integer", value: 90 } });
  const pageLeaf: InheritedAttrs = { rotate: 90 };
  const out = resolveRotate(dict, NO_INHERIT, pageLeaf, ref);
  expect(out).toEqual({ value: 90, warning: { some: false } });
});

test("/Rotate キー有り・180 で警告なし", () => {
  const dict = makePageDict({ rotate: { type: "integer", value: 180 } });
  const pageLeaf: InheritedAttrs = { rotate: 180 };
  const out = resolveRotate(dict, NO_INHERIT, pageLeaf, ref);
  expect(out).toEqual({ value: 180, warning: { some: false } });
});

test("/Rotate キー有り・270 で警告なし", () => {
  const dict = makePageDict({ rotate: { type: "integer", value: 270 } });
  const pageLeaf: InheritedAttrs = { rotate: 270 };
  const out = resolveRotate(dict, NO_INHERIT, pageLeaf, ref);
  expect(out).toEqual({ value: 270, warning: { some: false } });
});

test("/Rotate キー有り・-90 で正規化値 270・警告なし", () => {
  const dict = makePageDict({ rotate: { type: "integer", value: -90 } });
  const pageLeaf: InheritedAttrs = { rotate: -90 };
  const out = resolveRotate(dict, NO_INHERIT, pageLeaf, ref);
  expect(out).toEqual({ value: 270, warning: { some: false } });
});

test("/Rotate キー有り・450 で正規化値 90・警告なし", () => {
  const dict = makePageDict({ rotate: { type: "integer", value: 450 } });
  const pageLeaf: InheritedAttrs = { rotate: 450 };
  const out = resolveRotate(dict, NO_INHERIT, pageLeaf, ref);
  expect(out).toEqual({ value: 90, warning: { some: false } });
});

test("/Rotate キー有り・45 で正規化値 90・警告 Some", () => {
  const dict = makePageDict({ rotate: { type: "integer", value: 45 } });
  const pageLeaf: InheritedAttrs = { rotate: 45 };
  const out = resolveRotate(dict, NO_INHERIT, pageLeaf, ref);
  expect(out.value).toBe(90);
  expect(out.warning.some).toBe(true);
});

test("/Rotate キー有り・135 で正規化値 180・警告 Some", () => {
  const dict = makePageDict({ rotate: { type: "integer", value: 135 } });
  const pageLeaf: InheritedAttrs = { rotate: 135 };
  const out = resolveRotate(dict, NO_INHERIT, pageLeaf, ref);
  expect(out.value).toBe(180);
  expect(out.warning.some).toBe(true);
});

test("/Rotate キー有り・-45 で正規化値・警告 Some", () => {
  const dict = makePageDict({ rotate: { type: "integer", value: -45 } });
  const pageLeaf: InheritedAttrs = { rotate: -45 };
  const out = resolveRotate(dict, NO_INHERIT, pageLeaf, ref);
  expect(out.warning.some).toBe(true);
});

test("/Rotate 警告メッセージにページ参照番号が含まれる", () => {
  const dict = makePageDict({ rotate: { type: "integer", value: 45 } });
  const pageLeaf: InheritedAttrs = { rotate: 45 };
  const myRef = makeRef(42, 7);
  const out = resolveRotate(dict, NO_INHERIT, pageLeaf, myRef);
  expect(out.warning).toMatchObject({
    some: true,
    value: {
      code: "INVALID_ROTATE",
      message: expect.stringContaining("42 7"),
    },
  });
});
