import { expect, test } from "vitest";
import type { InheritedAttrs } from "./inheritance-resolver";
import { makePageDict } from "./page-tree-walker.test.helpers";
import { resolveCropBox } from "./resolve-crop-box";
import type { PdfRectangle } from "./resolved-page";

const NO_INHERIT: InheritedAttrs = {};
const FALLBACK: PdfRectangle = [0, 0, 100, 100];
const PAGE_BOX: PdfRectangle = [10, 10, 200, 200];
const INHERITED_BOX: PdfRectangle = [20, 20, 300, 300];

test("/CropBox キー有り・pageLeaf.cropBox 有りで pageLeaf.cropBox を返す", () => {
  const dict = makePageDict({ cropBox: PAGE_BOX });
  const pageLeaf: InheritedAttrs = { cropBox: PAGE_BOX };
  const got = resolveCropBox(dict, NO_INHERIT, pageLeaf, FALLBACK);
  expect(got).toBe(pageLeaf.cropBox);
});

test("/CropBox キー有り・pageLeaf.cropBox undefined で mediaBoxFallback を返す", () => {
  const dict = makePageDict({ cropBox: PAGE_BOX });
  const got = resolveCropBox(dict, NO_INHERIT, NO_INHERIT, FALLBACK);
  expect(got).toBe(FALLBACK);
});

test("/CropBox キー無し・inherited.cropBox 有りで inherited.cropBox を返す", () => {
  const dict = makePageDict({});
  const inherited: InheritedAttrs = { cropBox: INHERITED_BOX };
  const got = resolveCropBox(dict, inherited, NO_INHERIT, FALLBACK);
  expect(got).toBe(inherited.cropBox);
});

test("/CropBox キー無し・両 undefined で mediaBoxFallback を返す", () => {
  const dict = makePageDict({});
  const got = resolveCropBox(dict, NO_INHERIT, NO_INHERIT, FALLBACK);
  expect(got).toBe(FALLBACK);
});

test("戻り値は参照等価（クローンせず素通し）", () => {
  const dict = makePageDict({});
  const inherited: InheritedAttrs = { cropBox: INHERITED_BOX };
  const got = resolveCropBox(dict, inherited, NO_INHERIT, FALLBACK);
  expect(got).toBe(INHERITED_BOX);
});
