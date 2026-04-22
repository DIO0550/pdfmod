import { expect, test } from "vitest";
import type { PdfDictionary, PdfValue } from "../../pdf/types/pdf-types/index";
import {
  InheritanceResolver,
  type InheritedAttrs,
} from "./inheritance-resolver";
import {
  indirectRefValue,
  makePageDict,
  makeRef,
  okDict,
  unwrapErr,
  unwrapOk,
} from "./page-tree-walker.test.helpers";

const PAGE_REF = makeRef(2, 0);

const sampleResources = (key: string): PdfDictionary =>
  okDict(new Map<string, PdfValue>([[key, { type: "name", value: "marker" }]]));

test("IH-001: ページに /MediaBox が直接あれば継承値を無視する", () => {
  const pageDict = makePageDict({ mediaBox: [0, 0, 100, 100] });
  const result = InheritanceResolver.resolve(
    pageDict,
    { mediaBox: [0, 0, 999, 999] },
    { mediaBox: [0, 0, 100, 100] },
    PAGE_REF,
  );
  const outcome = unwrapOk(result);
  expect(outcome.page.mediaBox).toEqual([0, 0, 100, 100]);
});

test("IH-002: ページに /MediaBox がなく継承に存在すれば継承値を使う", () => {
  const pageDict = makePageDict({});
  const result = InheritanceResolver.resolve(
    pageDict,
    { mediaBox: [0, 0, 612, 792] },
    {},
    PAGE_REF,
  );
  const outcome = unwrapOk(result);
  expect(outcome.page.mediaBox).toEqual([0, 0, 612, 792]);
});

test("IH-003: ページも継承も /MediaBox 未定義なら MEDIABOX_NOT_FOUND を返す", () => {
  const pageDict = makePageDict({});
  const result = InheritanceResolver.resolve(pageDict, {}, {}, PAGE_REF);
  const error = unwrapErr(result);
  expect(error.code).toBe("MEDIABOX_NOT_FOUND");
});

const runRotate = (
  rotate: PdfValue,
  inheritedAttrs: InheritedAttrs,
  leafAttrs: InheritedAttrs,
): ReturnType<typeof InheritanceResolver.resolve> => {
  const pageDict = makePageDict({ mediaBox: [0, 0, 10, 10], rotate });
  return InheritanceResolver.resolve(
    pageDict,
    { mediaBox: [0, 0, 10, 10], ...inheritedAttrs },
    { mediaBox: [0, 0, 10, 10], ...leafAttrs },
    PAGE_REF,
  );
};

test("IH-004a: /Rotate が 45 の場合 90 に丸められ INVALID_ROTATE 警告が出る", () => {
  const outcome = unwrapOk(
    runRotate({ type: "integer", value: 45 }, {}, { rotate: 45 }),
  );
  expect(outcome.page.rotate).toBe(90);
  expect(outcome.warnings.some((w) => w.code === "INVALID_ROTATE")).toBe(true);
});

test("IH-004b: /Rotate が 450 の場合 90 に射影され警告なし", () => {
  const outcome = unwrapOk(
    runRotate({ type: "integer", value: 450 }, {}, { rotate: 450 }),
  );
  expect(outcome.page.rotate).toBe(90);
  expect(outcome.warnings).toEqual([]);
});

test("IH-004c: /Rotate が 90 の場合 警告なしで 90 を採用する", () => {
  const outcome = unwrapOk(
    runRotate({ type: "integer", value: 90 }, {}, { rotate: 90 }),
  );
  expect(outcome.page.rotate).toBe(90);
  expect(outcome.warnings).toEqual([]);
});

test("IH-004d: /Rotate が -90 の場合 270 に正規化され警告なし", () => {
  const outcome = unwrapOk(
    runRotate({ type: "integer", value: -90 }, {}, { rotate: -90 }),
  );
  expect(outcome.page.rotate).toBe(270);
  expect(outcome.warnings).toEqual([]);
});

test("IH-004e: /Rotate が -450 の場合 270 に正規化され警告なし", () => {
  const outcome = unwrapOk(
    runRotate({ type: "integer", value: -450 }, {}, { rotate: -450 }),
  );
  expect(outcome.page.rotate).toBe(270);
  expect(outcome.warnings).toEqual([]);
});

test("IH-004f: /Rotate キーが存在しない場合は警告なしで 0", () => {
  const pageDict = makePageDict({ mediaBox: [0, 0, 10, 10] });
  const outcome = unwrapOk(
    InheritanceResolver.resolve(
      pageDict,
      { mediaBox: [0, 0, 10, 10] },
      { mediaBox: [0, 0, 10, 10] },
      PAGE_REF,
    ),
  );
  expect(outcome.page.rotate).toBe(0);
  expect(outcome.warnings).toEqual([]);
});

test("IH-004g: /Rotate が文字列（非数値）なら INVALID_ROTATE + 0、継承を無視する", () => {
  const outcome = unwrapOk(
    runRotate(
      { type: "string", value: new Uint8Array(), encoding: "literal" },
      { rotate: 90 },
      {},
    ),
  );
  expect(outcome.page.rotate).toBe(0);
  expect(outcome.warnings.some((w) => w.code === "INVALID_ROTATE")).toBe(true);
});

test("IH-004h: /Rotate が null なら INVALID_ROTATE + 0", () => {
  const outcome = unwrapOk(runRotate({ type: "null" }, {}, {}));
  expect(outcome.page.rotate).toBe(0);
  expect(outcome.warnings.some((w) => w.code === "INVALID_ROTATE")).toBe(true);
});

test("IH-004i: /Rotate が 135 なら INVALID_ROTATE + 180", () => {
  const outcome = unwrapOk(
    runRotate({ type: "integer", value: 135 }, {}, { rotate: 135 }),
  );
  expect(outcome.page.rotate).toBe(180);
  expect(outcome.warnings.some((w) => w.code === "INVALID_ROTATE")).toBe(true);
});

test("IH-004j: /Rotate が -45 なら INVALID_ROTATE + 0", () => {
  const outcome = unwrapOk(
    runRotate({ type: "integer", value: -45 }, {}, { rotate: -45 }),
  );
  expect(outcome.page.rotate).toBe(0);
  expect(outcome.warnings.some((w) => w.code === "INVALID_ROTATE")).toBe(true);
});

test("IH-004k: ページ /Rotate キー不在、継承 /Rotate=90 なら警告なしで 90", () => {
  const pageDict = makePageDict({ mediaBox: [0, 0, 10, 10] });
  const outcome = unwrapOk(
    InheritanceResolver.resolve(
      pageDict,
      { mediaBox: [0, 0, 10, 10], rotate: 90 },
      { mediaBox: [0, 0, 10, 10] },
      PAGE_REF,
    ),
  );
  expect(outcome.page.rotate).toBe(90);
  expect(outcome.warnings).toEqual([]);
});

test("IH-005a: /CropBox 未定義時は MediaBox と同値になる", () => {
  const pageDict = makePageDict({ mediaBox: [0, 0, 100, 200] });
  const outcome = unwrapOk(
    InheritanceResolver.resolve(
      pageDict,
      {},
      { mediaBox: [0, 0, 100, 200] },
      PAGE_REF,
    ),
  );
  expect(outcome.page.cropBox).toEqual([0, 0, 100, 200]);
});

test("IH-005b: /CropBox が継承にある場合は継承値を採用", () => {
  const pageDict = makePageDict({ mediaBox: [0, 0, 100, 100] });
  const outcome = unwrapOk(
    InheritanceResolver.resolve(
      pageDict,
      { mediaBox: [0, 0, 100, 100], cropBox: [10, 10, 90, 90] },
      { mediaBox: [0, 0, 100, 100] },
      PAGE_REF,
    ),
  );
  expect(outcome.page.cropBox).toEqual([10, 10, 90, 90]);
});

test("Resources-a: ページの /Resources は親を完全シャドウイングする", () => {
  const pageResources = sampleResources("Page");
  const parentResources = sampleResources("Parent");
  const pageDict = makePageDict({
    mediaBox: [0, 0, 10, 10],
    resources: pageResources,
  });
  const outcome = unwrapOk(
    InheritanceResolver.resolve(
      pageDict,
      { mediaBox: [0, 0, 10, 10], resources: parentResources },
      { mediaBox: [0, 0, 10, 10], resources: pageResources },
      PAGE_REF,
    ),
  );
  expect(outcome.page.resources).toBe(pageResources);
});

test("Resources-b: 両方未定義なら空辞書が設定される", () => {
  const pageDict = makePageDict({ mediaBox: [0, 0, 10, 10] });
  const outcome = unwrapOk(
    InheritanceResolver.resolve(
      pageDict,
      { mediaBox: [0, 0, 10, 10] },
      { mediaBox: [0, 0, 10, 10] },
      PAGE_REF,
    ),
  );
  expect(outcome.page.resources.type).toBe("dictionary");
  expect(outcome.page.resources.entries.size).toBe(0);
});

test("contents-a: /Contents が単一 indirect-ref のとき IndirectRef として取り出される", () => {
  const pageDict = makePageDict({
    mediaBox: [0, 0, 10, 10],
    contents: indirectRefValue(7, 0),
  });
  const outcome = unwrapOk(
    InheritanceResolver.resolve(
      pageDict,
      { mediaBox: [0, 0, 10, 10] },
      { mediaBox: [0, 0, 10, 10] },
      PAGE_REF,
    ),
  );
  expect(outcome.page.contents).not.toBeNull();
  expect(Array.isArray(outcome.page.contents)).toBe(false);
  const single = outcome.page.contents as { objectNumber: number };
  expect(single.objectNumber).toBe(7);
});

test("contents-b: /Contents が配列のとき IndirectRef[]", () => {
  const pageDict = makePageDict({
    mediaBox: [0, 0, 10, 10],
    contents: {
      type: "array",
      elements: [indirectRefValue(7, 0), indirectRefValue(8, 0)],
    },
  });
  const outcome = unwrapOk(
    InheritanceResolver.resolve(
      pageDict,
      { mediaBox: [0, 0, 10, 10] },
      { mediaBox: [0, 0, 10, 10] },
      PAGE_REF,
    ),
  );
  expect(Array.isArray(outcome.page.contents)).toBe(true);
  expect((outcome.page.contents as unknown[]).length).toBe(2);
});

test("contents-c: /Contents 未定義なら null", () => {
  const pageDict = makePageDict({ mediaBox: [0, 0, 10, 10] });
  const outcome = unwrapOk(
    InheritanceResolver.resolve(
      pageDict,
      { mediaBox: [0, 0, 10, 10] },
      { mediaBox: [0, 0, 10, 10] },
      PAGE_REF,
    ),
  );
  expect(outcome.page.contents).toBeNull();
});

test("annots: /Annots が配列なら PdfObject[]、未定義なら null", () => {
  const withAnnots = makePageDict({
    mediaBox: [0, 0, 10, 10],
    annots: {
      type: "array",
      elements: [indirectRefValue(9, 0), indirectRefValue(10, 0)],
    },
  });
  const outcomeWith = unwrapOk(
    InheritanceResolver.resolve(
      withAnnots,
      { mediaBox: [0, 0, 10, 10] },
      { mediaBox: [0, 0, 10, 10] },
      PAGE_REF,
    ),
  );
  expect(Array.isArray(outcomeWith.page.annots)).toBe(true);
  expect(outcomeWith.page.annots?.length).toBe(2);

  const withoutAnnots = makePageDict({ mediaBox: [0, 0, 10, 10] });
  const outcomeWithout = unwrapOk(
    InheritanceResolver.resolve(
      withoutAnnots,
      { mediaBox: [0, 0, 10, 10] },
      { mediaBox: [0, 0, 10, 10] },
      PAGE_REF,
    ),
  );
  expect(outcomeWithout.page.annots).toBeNull();
});

test("userUnit: /UserUnit 未定義で 1.0", () => {
  const pageDict = makePageDict({ mediaBox: [0, 0, 10, 10] });
  const outcome = unwrapOk(
    InheritanceResolver.resolve(
      pageDict,
      { mediaBox: [0, 0, 10, 10] },
      { mediaBox: [0, 0, 10, 10] },
      PAGE_REF,
    ),
  );
  expect(outcome.page.userUnit).toBe(1.0);
});

test("userUnit: /UserUnit が 0 なら 1.0 にフォールバック", () => {
  const pageDict = makePageDict({
    mediaBox: [0, 0, 10, 10],
    userUnit: { type: "real", value: 0 },
  });
  const outcome = unwrapOk(
    InheritanceResolver.resolve(
      pageDict,
      { mediaBox: [0, 0, 10, 10] },
      { mediaBox: [0, 0, 10, 10] },
      PAGE_REF,
    ),
  );
  expect(outcome.page.userUnit).toBe(1.0);
});

test("userUnit: /UserUnit が負数なら 1.0 にフォールバック", () => {
  const pageDict = makePageDict({
    mediaBox: [0, 0, 10, 10],
    userUnit: { type: "real", value: -3 },
  });
  const outcome = unwrapOk(
    InheritanceResolver.resolve(
      pageDict,
      { mediaBox: [0, 0, 10, 10] },
      { mediaBox: [0, 0, 10, 10] },
      PAGE_REF,
    ),
  );
  expect(outcome.page.userUnit).toBe(1.0);
});

test("userUnit: /UserUnit が Infinity なら 1.0 にフォールバック", () => {
  const pageDict = makePageDict({
    mediaBox: [0, 0, 10, 10],
    userUnit: { type: "real", value: Number.POSITIVE_INFINITY },
  });
  const outcome = unwrapOk(
    InheritanceResolver.resolve(
      pageDict,
      { mediaBox: [0, 0, 10, 10] },
      { mediaBox: [0, 0, 10, 10] },
      PAGE_REF,
    ),
  );
  expect(outcome.page.userUnit).toBe(1.0);
});

test("userUnit: /UserUnit が 2.5 なら 2.5 を採用", () => {
  const pageDict = makePageDict({
    mediaBox: [0, 0, 10, 10],
    userUnit: { type: "real", value: 2.5 },
  });
  const outcome = unwrapOk(
    InheritanceResolver.resolve(
      pageDict,
      { mediaBox: [0, 0, 10, 10] },
      { mediaBox: [0, 0, 10, 10] },
      PAGE_REF,
    ),
  );
  expect(outcome.page.userUnit).toBe(2.5);
});

test("contents: 不正な objectNumber の indirect-ref は null として扱う", () => {
  const pageDict = makePageDict({
    mediaBox: [0, 0, 10, 10],
    contents: { type: "indirect-ref", objectNumber: 0, generationNumber: 0 },
  });
  const outcome = unwrapOk(
    InheritanceResolver.resolve(
      pageDict,
      { mediaBox: [0, 0, 10, 10] },
      { mediaBox: [0, 0, 10, 10] },
      PAGE_REF,
    ),
  );
  expect(outcome.page.contents).toBeNull();
});

test("contents: 配列内の不正な indirect-ref はスキップされる", () => {
  const pageDict = makePageDict({
    mediaBox: [0, 0, 10, 10],
    contents: {
      type: "array",
      elements: [
        { type: "indirect-ref", objectNumber: 0, generationNumber: 0 },
        { type: "indirect-ref", objectNumber: 7, generationNumber: 0 },
      ],
    },
  });
  const outcome = unwrapOk(
    InheritanceResolver.resolve(
      pageDict,
      { mediaBox: [0, 0, 10, 10] },
      { mediaBox: [0, 0, 10, 10] },
      PAGE_REF,
    ),
  );
  expect(Array.isArray(outcome.page.contents)).toBe(true);
  expect((outcome.page.contents as unknown[]).length).toBe(1);
});

test("Rotate: NaN / Infinity は警告ありで 0 に正規化される", () => {
  const outcome = unwrapOk(
    runRotate(
      { type: "real", value: Number.POSITIVE_INFINITY },
      {},
      {
        rotate: Number.POSITIVE_INFINITY,
      },
    ),
  );
  expect(outcome.page.rotate).toBe(0);
});

test("objectRef: ResolvedPage.objectRef に渡した pageRef が入る", () => {
  const pageDict = makePageDict({ mediaBox: [0, 0, 10, 10] });
  const ref = makeRef(42, 5);
  const outcome = unwrapOk(
    InheritanceResolver.resolve(
      pageDict,
      { mediaBox: [0, 0, 10, 10] },
      { mediaBox: [0, 0, 10, 10] },
      ref,
    ),
  );
  expect(outcome.page.objectRef).toBe(ref);
});
