import { expect, test } from "vitest";
import { GenerationNumber } from "../pdf/types/generation-number/index";
import type { IndirectRef } from "../pdf/types/indirect-ref/index";
import { ObjectNumber } from "../pdf/types/object-number/index";
import type { PdfDictionary } from "../pdf/types/pdf-types/index";
import type {
  PageRotate,
  PdfRectangle,
  ResolvedPage,
} from "./page-tree/resolved-page";
import { PdfPage } from "./pdf-page";

const emptyDict: PdfDictionary = {
  type: "dictionary",
  entries: new Map(),
};

const makeRef = (objNum: number, genNum = 0): IndirectRef => ({
  objectNumber: ObjectNumber.of(objNum),
  generationNumber: GenerationNumber.of(genNum),
});

interface MakeResolvedPageArgs {
  mediaBox?: PdfRectangle;
  cropBox?: PdfRectangle;
  rotate?: PageRotate;
  userUnit?: number;
  objectRef?: IndirectRef;
}

const makeResolvedPage = (args: MakeResolvedPageArgs = {}): ResolvedPage => {
  const mediaBox = args.mediaBox ?? [0, 0, 100, 200];
  return {
    mediaBox,
    cropBox: args.cropBox ?? mediaBox,
    rotate: args.rotate ?? 0,
    userUnit: args.userUnit ?? 1.0,
    resources: emptyDict,
    contents: null,
    annots: null,
    objectRef: args.objectRef ?? makeRef(1, 0),
  };
};

test.each([
  {
    label: "PP-001 rotate=0  userUnit=1.0",
    rotate: 0 as PageRotate,
    userUnit: 1.0,
    expectW: 100,
    expectH: 200,
  },
  {
    label: "PP-001 rotate=180 userUnit=1.0",
    rotate: 180 as PageRotate,
    userUnit: 1.0,
    expectW: 100,
    expectH: 200,
  },
  {
    label: "PP-002 rotate=90  userUnit=1.0",
    rotate: 90 as PageRotate,
    userUnit: 1.0,
    expectW: 200,
    expectH: 100,
  },
  {
    label: "PP-002 rotate=270 userUnit=1.0",
    rotate: 270 as PageRotate,
    userUnit: 1.0,
    expectW: 200,
    expectH: 100,
  },
  {
    label: "PP-003 rotate=0   userUnit=2.0",
    rotate: 0 as PageRotate,
    userUnit: 2.0,
    expectW: 200,
    expectH: 400,
  },
  {
    label: "PP-003 rotate=90  userUnit=0.5",
    rotate: 90 as PageRotate,
    userUnit: 0.5,
    expectW: 100,
    expectH: 50,
  },
  {
    label: "PP-003 rotate=180 userUnit=2.0",
    rotate: 180 as PageRotate,
    userUnit: 2.0,
    expectW: 200,
    expectH: 400,
  },
  {
    label: "PP-003 rotate=270 userUnit=0.5",
    rotate: 270 as PageRotate,
    userUnit: 0.5,
    expectW: 100,
    expectH: 50,
  },
])("$label のとき width/height が PP ルールどおり算出される", ({
  rotate,
  userUnit,
  expectW,
  expectH,
}) => {
  const page = PdfPage.from(makeResolvedPage({ rotate, userUnit }));
  expect(page.width).toBe(expectW);
  expect(page.height).toBe(expectH);
});

test("非原点 mediaBox でも rotate=0 のとき width = urx-llx, height = ury-lly", () => {
  const page = PdfPage.from(
    makeResolvedPage({
      mediaBox: [10, 20, 110, 220],
      rotate: 0,
      userUnit: 1.0,
    }),
  );
  expect(page.width).toBe(100);
  expect(page.height).toBe(200);
});

test("非原点 mediaBox でも rotate=90 のとき width = ury-lly, height = urx-llx", () => {
  const page = PdfPage.from(
    makeResolvedPage({
      mediaBox: [10, 20, 110, 220],
      rotate: 90,
      userUnit: 1.0,
    }),
  );
  expect(page.width).toBe(200);
  expect(page.height).toBe(100);
});

test("mediaBox プロパティが ResolvedPage.mediaBox の値と一致する", () => {
  const mediaBox: PdfRectangle = [0, 0, 100, 200];
  const page = PdfPage.from(makeResolvedPage({ mediaBox }));
  expect(page.mediaBox).toEqual([0, 0, 100, 200]);
});

test("cropBox プロパティが ResolvedPage.cropBox の値と一致する（mediaBox と異なる場合）", () => {
  const page = PdfPage.from(
    makeResolvedPage({
      mediaBox: [0, 0, 100, 200],
      cropBox: [10, 20, 90, 180],
    }),
  );
  expect(page.cropBox).toEqual([10, 20, 90, 180]);
});

test("cropBox プロパティが ResolvedPage.cropBox の値と一致する（mediaBox と参照同一の場合）", () => {
  const mediaBox: PdfRectangle = [0, 0, 100, 200];
  const page = PdfPage.from(makeResolvedPage({ mediaBox, cropBox: mediaBox }));
  expect(page.cropBox).toEqual([0, 0, 100, 200]);
  expect(page.cropBox).toBe(page.mediaBox);
});

test("rotate プロパティが ResolvedPage.rotate の値と一致する", () => {
  const page = PdfPage.from(makeResolvedPage({ rotate: 270 }));
  expect(page.rotate).toBe(270);
});

test("userUnit プロパティが ResolvedPage.userUnit の値と一致する", () => {
  const page = PdfPage.from(makeResolvedPage({ userUnit: 1.5 }));
  expect(page.userUnit).toBe(1.5);
});

test("ref プロパティが ResolvedPage.objectRef の値と一致する", () => {
  const ref = makeRef(7, 2);
  const page = PdfPage.from(makeResolvedPage({ objectRef: ref }));
  expect(page.ref).toBe(ref);
});
