import { expect, test } from "vitest";
import type { PdfDictionary, PdfValue } from "../../pdf/types/pdf-types/index";
import { AttrResolver } from "./attr-resolver";
import type { InheritedAttrs } from "./inheritance-resolver";
import {
  makePageDict,
  makeRef,
  okDict,
  unwrapErr,
  unwrapOk,
} from "./page-tree-walker.test.helpers";
import type { PdfRectangle } from "./resolved-page";

const NO_INHERIT: InheritedAttrs = {};
const ref = makeRef(10, 0);
const A4: PdfRectangle = [0, 0, 595, 842];
const LETTER: PdfRectangle = [0, 0, 612, 792];
const FALLBACK: PdfRectangle = [0, 0, 100, 100];
const PAGE_BOX: PdfRectangle = [10, 10, 200, 200];
const INHERITED_BOX: PdfRectangle = [20, 20, 300, 300];

test("AttrResolver.mediaBox は /MediaBox キー有り・pageLeaf.mediaBox 有りで pageLeaf.mediaBox を返す", () => {
  const dict = makePageDict({ mediaBox: A4 });
  const pageLeaf: InheritedAttrs = { mediaBox: A4 };
  const inherited: InheritedAttrs = { mediaBox: LETTER };
  expect(
    unwrapOk(AttrResolver.mediaBox(dict, inherited, pageLeaf, ref)),
  ).toEqual(A4);
});

test("AttrResolver.mediaBox は /MediaBox キー有り・pageLeaf.mediaBox undefined で MEDIABOX_NOT_FOUND（inherited を見ない）", () => {
  const dict = okDict(
    new Map([
      ["Type", { type: "name", value: "Page" } as const],
      ["MediaBox", { type: "name", value: "Bogus" } as const],
    ]),
  );
  const inherited: InheritedAttrs = { mediaBox: LETTER };
  const error = unwrapErr(
    AttrResolver.mediaBox(dict, inherited, NO_INHERIT, ref),
  );
  expect(error.code).toBe("MEDIABOX_NOT_FOUND");
});

test("AttrResolver.mediaBox は /MediaBox キー無し・inherited.mediaBox 有りで inherited.mediaBox を返す", () => {
  const dict = makePageDict({});
  const inherited: InheritedAttrs = { mediaBox: LETTER };
  expect(
    unwrapOk(AttrResolver.mediaBox(dict, inherited, NO_INHERIT, ref)),
  ).toEqual(LETTER);
});

test("AttrResolver.mediaBox は /MediaBox キー無し・両 undefined で MEDIABOX_NOT_FOUND", () => {
  const dict = makePageDict({});
  const error = unwrapErr(
    AttrResolver.mediaBox(dict, NO_INHERIT, NO_INHERIT, ref),
  );
  expect(error.code).toBe("MEDIABOX_NOT_FOUND");
});

test("AttrResolver.mediaBox の Err.message にページ参照番号が含まれる", () => {
  const dict = makePageDict({});
  const myRef = makeRef(99, 5);
  const error = unwrapErr(
    AttrResolver.mediaBox(dict, NO_INHERIT, NO_INHERIT, myRef),
  );
  expect(error.message).toContain("99");
  expect(error.message).toContain("5");
});

test("AttrResolver.cropBox は /CropBox キー有り・pageLeaf.cropBox 有りで pageLeaf.cropBox を返す", () => {
  const dict = makePageDict({ cropBox: PAGE_BOX });
  const pageLeaf: InheritedAttrs = { cropBox: PAGE_BOX };
  const got = AttrResolver.cropBox(dict, NO_INHERIT, pageLeaf, FALLBACK);
  expect(got).toBe(pageLeaf.cropBox);
});

test("AttrResolver.cropBox は /CropBox キー有り・pageLeaf.cropBox undefined で mediaBoxFallback を返す", () => {
  const dict = makePageDict({ cropBox: PAGE_BOX });
  const got = AttrResolver.cropBox(dict, NO_INHERIT, NO_INHERIT, FALLBACK);
  expect(got).toBe(FALLBACK);
});

test("AttrResolver.cropBox は /CropBox キー無し・inherited.cropBox 有りで inherited.cropBox を返す", () => {
  const dict = makePageDict({});
  const inherited: InheritedAttrs = { cropBox: INHERITED_BOX };
  const got = AttrResolver.cropBox(dict, inherited, NO_INHERIT, FALLBACK);
  expect(got).toBe(inherited.cropBox);
});

test("AttrResolver.cropBox は /CropBox キー無し・両 undefined で mediaBoxFallback を返す", () => {
  const dict = makePageDict({});
  const got = AttrResolver.cropBox(dict, NO_INHERIT, NO_INHERIT, FALLBACK);
  expect(got).toBe(FALLBACK);
});

test("AttrResolver.cropBox の戻り値は参照等価（クローンせず素通し）", () => {
  const dict = makePageDict({});
  const inherited: InheritedAttrs = { cropBox: INHERITED_BOX };
  const got = AttrResolver.cropBox(dict, inherited, NO_INHERIT, FALLBACK);
  expect(got).toBe(INHERITED_BOX);
});

test("AttrResolver.rotate は /Rotate キー不在・inherited.rotate undefined で 0 / warning none", () => {
  const dict = makePageDict({});
  const out = AttrResolver.rotate(dict, NO_INHERIT, NO_INHERIT, ref);
  expect(out).toEqual({ value: 0, warning: { some: false } });
});

test("AttrResolver.rotate は /Rotate キー不在・inherited.rotate=90 で 90 / warning none", () => {
  const dict = makePageDict({});
  const inherited: InheritedAttrs = { rotate: 90 };
  const out = AttrResolver.rotate(dict, inherited, NO_INHERIT, ref);
  expect(out).toEqual({ value: 90, warning: { some: false } });
});

test("AttrResolver.rotate は /Rotate キー不在・inherited.rotate=135 で 180 / warning none（projectRotate）", () => {
  const dict = makePageDict({});
  const inherited: InheritedAttrs = { rotate: 135 };
  const out = AttrResolver.rotate(dict, inherited, NO_INHERIT, ref);
  expect(out).toEqual({ value: 180, warning: { some: false } });
});

test("AttrResolver.rotate は /Rotate キー不在・inherited.rotate=NaN で 0 / warning none", () => {
  const dict = makePageDict({});
  const inherited: InheritedAttrs = { rotate: Number.NaN };
  const out = AttrResolver.rotate(dict, inherited, NO_INHERIT, ref);
  expect(out).toEqual({ value: 0, warning: { some: false } });
});

test("AttrResolver.rotate は /Rotate キー有り・pageLeaf.rotate undefined（非数値）で INVALID_ROTATE 警告", () => {
  const dict = makePageDict({ rotate: { type: "name", value: "Foo" } });
  const out = AttrResolver.rotate(dict, NO_INHERIT, NO_INHERIT, ref);
  expect(out.value).toBe(0);
  expect(out.warning.some).toBe(true);
});

test("AttrResolver.rotate は /Rotate キー有り・90 で警告なし", () => {
  const dict = makePageDict({ rotate: { type: "integer", value: 90 } });
  const pageLeaf: InheritedAttrs = { rotate: 90 };
  const out = AttrResolver.rotate(dict, NO_INHERIT, pageLeaf, ref);
  expect(out).toEqual({ value: 90, warning: { some: false } });
});

test("AttrResolver.rotate は /Rotate キー有り・180 で警告なし", () => {
  const dict = makePageDict({ rotate: { type: "integer", value: 180 } });
  const pageLeaf: InheritedAttrs = { rotate: 180 };
  const out = AttrResolver.rotate(dict, NO_INHERIT, pageLeaf, ref);
  expect(out).toEqual({ value: 180, warning: { some: false } });
});

test("AttrResolver.rotate は /Rotate キー有り・270 で警告なし", () => {
  const dict = makePageDict({ rotate: { type: "integer", value: 270 } });
  const pageLeaf: InheritedAttrs = { rotate: 270 };
  const out = AttrResolver.rotate(dict, NO_INHERIT, pageLeaf, ref);
  expect(out).toEqual({ value: 270, warning: { some: false } });
});

test("AttrResolver.rotate は /Rotate キー有り・-90 で正規化値 270・警告なし", () => {
  const dict = makePageDict({ rotate: { type: "integer", value: -90 } });
  const pageLeaf: InheritedAttrs = { rotate: -90 };
  const out = AttrResolver.rotate(dict, NO_INHERIT, pageLeaf, ref);
  expect(out).toEqual({ value: 270, warning: { some: false } });
});

test("AttrResolver.rotate は /Rotate キー有り・450 で正規化値 90・警告なし", () => {
  const dict = makePageDict({ rotate: { type: "integer", value: 450 } });
  const pageLeaf: InheritedAttrs = { rotate: 450 };
  const out = AttrResolver.rotate(dict, NO_INHERIT, pageLeaf, ref);
  expect(out).toEqual({ value: 90, warning: { some: false } });
});

test("AttrResolver.rotate は /Rotate キー有り・45 で正規化値 90・警告 Some", () => {
  const dict = makePageDict({ rotate: { type: "integer", value: 45 } });
  const pageLeaf: InheritedAttrs = { rotate: 45 };
  const out = AttrResolver.rotate(dict, NO_INHERIT, pageLeaf, ref);
  expect(out.value).toBe(90);
  expect(out.warning.some).toBe(true);
});

test("AttrResolver.rotate は /Rotate キー有り・135 で正規化値 180・警告 Some", () => {
  const dict = makePageDict({ rotate: { type: "integer", value: 135 } });
  const pageLeaf: InheritedAttrs = { rotate: 135 };
  const out = AttrResolver.rotate(dict, NO_INHERIT, pageLeaf, ref);
  expect(out.value).toBe(180);
  expect(out.warning.some).toBe(true);
});

test("AttrResolver.rotate は /Rotate キー有り・-45 で正規化値・警告 Some", () => {
  const dict = makePageDict({ rotate: { type: "integer", value: -45 } });
  const pageLeaf: InheritedAttrs = { rotate: -45 };
  const out = AttrResolver.rotate(dict, NO_INHERIT, pageLeaf, ref);
  expect(out.warning.some).toBe(true);
});

test("AttrResolver.rotate の警告メッセージにページ参照番号が含まれる", () => {
  const dict = makePageDict({ rotate: { type: "integer", value: 45 } });
  const pageLeaf: InheritedAttrs = { rotate: 45 };
  const myRef = makeRef(42, 7);
  const out = AttrResolver.rotate(dict, NO_INHERIT, pageLeaf, myRef);
  expect(out.warning).toMatchObject({
    some: true,
    value: {
      code: "INVALID_ROTATE",
      message: expect.stringContaining("42 7"),
    },
  });
});

test("AttrResolver.resources は /Resources キー有り・pageLeaf.resources 有りで pageLeaf.resources を返す", () => {
  const leafResources = okDict(
    new Map<string, PdfValue>([["Font", { type: "name", value: "F1" }]]),
  );
  const dict = makePageDict({ resources: leafResources });
  const pageLeaf: InheritedAttrs = { resources: leafResources };
  expect(AttrResolver.resources(dict, NO_INHERIT, pageLeaf)).toBe(
    leafResources,
  );
});

test("AttrResolver.resources は /Resources キー有り・pageLeaf.resources undefined で空辞書を返す", () => {
  const dict = makePageDict({
    resources: okDict(new Map<string, PdfValue>()),
  });
  const out = AttrResolver.resources(dict, NO_INHERIT, NO_INHERIT);
  expect(out.type).toBe("dictionary");
  expect(out.entries.size).toBe(0);
});

test("AttrResolver.resources は /Resources キー無し・inherited.resources 有りで inherited.resources を返す", () => {
  const inheritedResources = okDict(
    new Map<string, PdfValue>([["XObject", { type: "name", value: "X1" }]]),
  );
  const dict = makePageDict({});
  const inherited: InheritedAttrs = { resources: inheritedResources };
  expect(AttrResolver.resources(dict, inherited, NO_INHERIT)).toBe(
    inheritedResources,
  );
});

test("AttrResolver.resources は /Resources キー無し・両 undefined で空辞書を返す", () => {
  const dict = makePageDict({});
  const out = AttrResolver.resources(dict, NO_INHERIT, NO_INHERIT);
  expect(out.type).toBe("dictionary");
  expect(out.entries.size).toBe(0);
});

test("AttrResolver.resources は空辞書フォールバック時に毎回別インスタンスを返す（cross-page contamination 防止）", () => {
  const dict = makePageDict({});
  const out1: PdfDictionary = AttrResolver.resources(
    dict,
    NO_INHERIT,
    NO_INHERIT,
  );
  const out2: PdfDictionary = AttrResolver.resources(
    dict,
    NO_INHERIT,
    NO_INHERIT,
  );
  expect(out1).not.toBe(out2);
  expect(out1.entries).not.toBe(out2.entries);
});
