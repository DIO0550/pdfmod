import { expect, test } from "vitest";
import type { PdfValue } from "../../../../pdf/types/pdf-types/index";
import { AttrResolver } from "../../attr-resolver";
import type { InheritedAttrs } from "../../inheritance-resolver";
import {
  makeRef,
  okDict,
  unwrapErr,
  unwrapOk,
} from "../../page-tree-walker/__tests__/page-tree-walker.test.helpers";
import type { PdfRectangle } from "../../resolved-page";

const NO_INHERIT: InheritedAttrs = {};
const ref = makeRef(10, 0);
const A4: PdfRectangle = [0, 0, 595, 842];
const LETTER: PdfRectangle = [0, 0, 612, 792];
const FALLBACK: PdfRectangle = [0, 0, 100, 100];
const PAGE_BOX: PdfRectangle = [10, 10, 200, 200];
const INHERITED_BOX: PdfRectangle = [20, 20, 300, 300];

test("AttrResolver.mediaBox は pageLeaf.mediaBox を inherited より優先する", () => {
  const pageLeaf: InheritedAttrs = { mediaBox: A4 };
  const inherited: InheritedAttrs = { mediaBox: LETTER };
  expect(unwrapOk(AttrResolver.mediaBox(inherited, pageLeaf, ref))).toEqual(A4);
});

test("AttrResolver.mediaBox は pageLeaf.mediaBox undefined で inherited.mediaBox を返す（局所値が無効だった場合を含む）", () => {
  const inherited: InheritedAttrs = { mediaBox: LETTER };
  expect(unwrapOk(AttrResolver.mediaBox(inherited, NO_INHERIT, ref))).toEqual(
    LETTER,
  );
});

test("AttrResolver.mediaBox は両 undefined で MEDIABOX_NOT_FOUND", () => {
  const error = unwrapErr(AttrResolver.mediaBox(NO_INHERIT, NO_INHERIT, ref));
  expect(error.code).toBe("MEDIABOX_NOT_FOUND");
});

test("AttrResolver.mediaBox の Err.message にページ参照番号が含まれる", () => {
  const myRef = makeRef(99, 5);
  const error = unwrapErr(AttrResolver.mediaBox(NO_INHERIT, NO_INHERIT, myRef));
  expect(error.message).toContain("99");
  expect(error.message).toContain("5");
});

test("AttrResolver.cropBox は pageLeaf.cropBox を最優先で返す", () => {
  const pageLeaf: InheritedAttrs = { cropBox: PAGE_BOX };
  const inherited: InheritedAttrs = { cropBox: INHERITED_BOX };
  expect(AttrResolver.cropBox(inherited, pageLeaf, FALLBACK)).toBe(PAGE_BOX);
});

test("AttrResolver.cropBox は pageLeaf.cropBox undefined で inherited.cropBox を返す", () => {
  const inherited: InheritedAttrs = { cropBox: INHERITED_BOX };
  expect(AttrResolver.cropBox(inherited, NO_INHERIT, FALLBACK)).toBe(
    INHERITED_BOX,
  );
});

test("AttrResolver.cropBox は両 undefined で mediaBoxFallback を返す", () => {
  expect(AttrResolver.cropBox(NO_INHERIT, NO_INHERIT, FALLBACK)).toBe(FALLBACK);
});

test("AttrResolver.rotate は pageLeaf.rotate を inherited より優先する", () => {
  const inherited: InheritedAttrs = { rotate: 270 };
  const pageLeaf: InheritedAttrs = { rotate: 90 };
  expect(AttrResolver.rotate(inherited, pageLeaf, ref)).toEqual({
    value: 90,
    warning: { some: false },
  });
});

test("AttrResolver.rotate は pageLeaf.rotate undefined で inherited.rotate を返す", () => {
  const inherited: InheritedAttrs = { rotate: 270 };
  expect(AttrResolver.rotate(inherited, NO_INHERIT, ref)).toEqual({
    value: 270,
    warning: { some: false },
  });
});

test("AttrResolver.rotate は両 undefined で 0 / warning none", () => {
  expect(AttrResolver.rotate(NO_INHERIT, NO_INHERIT, ref)).toEqual({
    value: 0,
    warning: { some: false },
  });
});

test("AttrResolver.rotate は -90 を 270 に正規化し警告なし", () => {
  const pageLeaf: InheritedAttrs = { rotate: -90 };
  expect(AttrResolver.rotate(NO_INHERIT, pageLeaf, ref)).toEqual({
    value: 270,
    warning: { some: false },
  });
});

test("AttrResolver.rotate は 450 を 90 に正規化し警告なし", () => {
  const pageLeaf: InheritedAttrs = { rotate: 450 };
  expect(AttrResolver.rotate(NO_INHERIT, pageLeaf, ref)).toEqual({
    value: 90,
    warning: { some: false },
  });
});

test("AttrResolver.rotate は 45 で正規化値 90・警告 Some", () => {
  const pageLeaf: InheritedAttrs = { rotate: 45 };
  const out = AttrResolver.rotate(NO_INHERIT, pageLeaf, ref);
  expect(out.value).toBe(90);
  expect(out.warning.some).toBe(true);
});

test("AttrResolver.rotate は 135 で正規化値 180・警告 Some", () => {
  const pageLeaf: InheritedAttrs = { rotate: 135 };
  const out = AttrResolver.rotate(NO_INHERIT, pageLeaf, ref);
  expect(out.value).toBe(180);
  expect(out.warning.some).toBe(true);
});

test("AttrResolver.rotate は -45 で警告 Some", () => {
  const pageLeaf: InheritedAttrs = { rotate: -45 };
  expect(AttrResolver.rotate(NO_INHERIT, pageLeaf, ref).warning.some).toBe(
    true,
  );
});

test("AttrResolver.rotate は inherited が 90 の非倍数でも警告 Some", () => {
  const inherited: InheritedAttrs = { rotate: 135 };
  const out = AttrResolver.rotate(inherited, NO_INHERIT, ref);
  expect(out.value).toBe(180);
  expect(out.warning.some).toBe(true);
});

test("AttrResolver.rotate は NaN で 0・警告 Some", () => {
  const pageLeaf: InheritedAttrs = { rotate: Number.NaN };
  const out = AttrResolver.rotate(NO_INHERIT, pageLeaf, ref);
  expect(out.value).toBe(0);
  expect(out.warning.some).toBe(true);
});

test("AttrResolver.rotate の警告メッセージにページ参照番号が含まれる", () => {
  const pageLeaf: InheritedAttrs = { rotate: 45 };
  const myRef = makeRef(42, 7);
  const out = AttrResolver.rotate(NO_INHERIT, pageLeaf, myRef);
  expect(out.warning).toMatchObject({
    some: true,
    value: {
      code: "INVALID_ROTATE",
      message: expect.stringContaining("42 7"),
    },
  });
});

test("AttrResolver.resources は pageLeaf.resources を最優先で返し、親リソースを完全置換する", () => {
  const leafResources = okDict(
    new Map<string, PdfValue>([["Font", { type: "name", value: "F2" }]]),
  );
  const inherited: InheritedAttrs = {
    resources: okDict(
      new Map<string, PdfValue>([["Font", { type: "name", value: "F1" }]]),
    ),
  };
  const pageLeaf: InheritedAttrs = { resources: leafResources };
  const res = AttrResolver.resources(inherited, pageLeaf);
  expect(res.dictionary).toBe(leafResources);
  expect(res.dictionary.entries.get("Font")).toEqual({
    type: "name",
    value: "F2",
  });
});

test("AttrResolver.resources は pageLeaf.resources undefined で inherited.resources を返す", () => {
  const inheritedResources = okDict(
    new Map<string, PdfValue>([["XObject", { type: "name", value: "X1" }]]),
  );
  const inherited: InheritedAttrs = { resources: inheritedResources };
  const res = AttrResolver.resources(inherited, NO_INHERIT);
  expect(res.dictionary).toBe(inheritedResources);
});

test("AttrResolver.resources は両 undefined で空辞書を返す", () => {
  const out = AttrResolver.resources(NO_INHERIT, NO_INHERIT);
  expect(out.dictionary.type).toBe("dictionary");
  expect(out.dictionary.entries.size).toBe(0);
});

test("AttrResolver.resources は空辞書フォールバック時に毎回別インスタンスを返す（cross-page contamination 防止）", () => {
  const out1 = AttrResolver.resources(NO_INHERIT, NO_INHERIT);
  const out2 = AttrResolver.resources(NO_INHERIT, NO_INHERIT);
  expect(out1.dictionary).not.toBe(out2.dictionary);
  expect(out1.dictionary.entries).not.toBe(out2.dictionary.entries);
});

test("3階層ページツリーでのルートPagesからの継承解決", () => {
  const rootResources = okDict(
    new Map<string, PdfValue>([["Font", { type: "name", value: "F1" }]]),
  );
  // Root -> Middle (リソース未定義)
  const middleInherited: InheritedAttrs = { resources: rootResources };
  const middleLeaf: InheritedAttrs = {};
  const middleResolvedResources =
    middleLeaf.resources ?? middleInherited.resources;

  // Middle -> Leaf (リソース未定義)
  const leafInherited: InheritedAttrs = { resources: middleResolvedResources };
  const leafLeaf: InheritedAttrs = {};
  const leafResources = AttrResolver.resources(leafInherited, leafLeaf);

  expect(leafResources.dictionary).toBe(rootResources);
});

test("3階層ページツリーでの中間Pagesによるルートリソースのオーバーライド（全置換原則）", () => {
  const rootResources = okDict(
    new Map<string, PdfValue>([["Font", { type: "name", value: "F1" }]]),
  );
  const middleResources = okDict(
    new Map<string, PdfValue>([["Font", { type: "name", value: "F2" }]]),
  );

  // Root -> Middle (Middle でオーバーライド)
  const middleInherited: InheritedAttrs = { resources: rootResources };
  const middleLeaf: InheritedAttrs = { resources: middleResources };
  const middleResolved = middleLeaf.resources ?? middleInherited.resources;

  // Middle -> Leaf (未定義)
  const leafInherited: InheritedAttrs = { resources: middleResolved };
  const leafLeaf: InheritedAttrs = {};
  const leafRes = AttrResolver.resources(leafInherited, leafLeaf);

  expect(leafRes.dictionary).toBe(middleResources);
  expect(leafRes.dictionary.entries.get("Font")).toEqual({
    type: "name",
    value: "F2",
  });
});

test("親Pagesノードの /Resources 自体が解決済み辞書の場合の継承解決", () => {
  const parentResources = okDict(
    new Map<string, PdfValue>([["Font", { type: "name", value: "F1" }]]),
  );
  const inherited: InheritedAttrs = { resources: parentResources };
  const leafRes = AttrResolver.resources(inherited, NO_INHERIT);

  expect(leafRes.dictionary).toBe(parentResources);
});
