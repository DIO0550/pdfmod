import { expect, test } from "vitest";
import type { InheritedAttrs } from "./inheritance-resolver";
import {
  makePageDict,
  makeRef,
  okDict,
  unwrapErr,
  unwrapOk,
} from "./page-tree-walker.test.helpers";
import { resolveMediaBox } from "./resolve-media-box";
import type { PdfRectangle } from "./resolved-page";

const NO_INHERIT: InheritedAttrs = {};
const ref = makeRef(11, 0);
const A4: PdfRectangle = [0, 0, 595, 842];
const LETTER: PdfRectangle = [0, 0, 612, 792];

test("/MediaBox キー有り・pageLeaf.mediaBox 有りで pageLeaf.mediaBox を返す", () => {
  const dict = makePageDict({ mediaBox: A4 });
  const pageLeaf: InheritedAttrs = { mediaBox: A4 };
  const inherited: InheritedAttrs = { mediaBox: LETTER };
  expect(unwrapOk(resolveMediaBox(dict, inherited, pageLeaf, ref))).toEqual(A4);
});

test("/MediaBox キー有り・pageLeaf.mediaBox undefined で MEDIABOX_NOT_FOUND（inherited を見ない）", () => {
  const dict = okDict(
    new Map([
      ["Type", { type: "name", value: "Page" } as const],
      ["MediaBox", { type: "name", value: "Bogus" } as const],
    ]),
  );
  const inherited: InheritedAttrs = { mediaBox: LETTER };
  const error = unwrapErr(resolveMediaBox(dict, inherited, NO_INHERIT, ref));
  expect(error.code).toBe("MEDIABOX_NOT_FOUND");
});

test("/MediaBox キー無し・inherited.mediaBox 有りで inherited.mediaBox を返す", () => {
  const dict = makePageDict({});
  const inherited: InheritedAttrs = { mediaBox: LETTER };
  expect(unwrapOk(resolveMediaBox(dict, inherited, NO_INHERIT, ref))).toEqual(
    LETTER,
  );
});

test("/MediaBox キー無し・両 undefined で MEDIABOX_NOT_FOUND", () => {
  const dict = makePageDict({});
  const error = unwrapErr(resolveMediaBox(dict, NO_INHERIT, NO_INHERIT, ref));
  expect(error.code).toBe("MEDIABOX_NOT_FOUND");
});

test("Err.message にページ参照番号が含まれる", () => {
  const dict = makePageDict({});
  const myRef = makeRef(99, 5);
  const error = unwrapErr(resolveMediaBox(dict, NO_INHERIT, NO_INHERIT, myRef));
  expect(error.message).toContain("99");
  expect(error.message).toContain("5");
});
