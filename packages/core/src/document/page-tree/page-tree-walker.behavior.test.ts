import { expect, test } from "vitest";
import type {
  IndirectRef,
  PdfDictionary,
  PdfObject,
  PdfValue,
} from "../../pdf/types/pdf-types/index";
import type { ResolveRef } from "../catalog-parser";
import { PageTreeWalker } from "./page-tree-walker";
import {
  indirectRefValue,
  makeFailingResolver,
  makePageDict,
  makePagesDict,
  makeRef,
  makeResolverMap,
  makeResolverStub,
  okDict,
  unwrapErr,
  unwrapOk,
} from "./page-tree-walker.test.helpers";

const addTo = (
  map: Map<string, PdfObject>,
  ref: IndirectRef,
  obj: PdfObject,
): void => {
  map.set(`${ref.objectNumber}-${ref.generationNumber}`, obj);
};

test("PW-002: 単一 /Page ノードから ResolvedPage 1 件が生成される", async () => {
  const pageRef = makeRef(2, 0);
  const page = makePageDict({ mediaBox: [0, 0, 612, 792] });
  const objects = new Map<string, PdfObject>();
  addTo(objects, pageRef, page);
  const result = await PageTreeWalker.walk(pageRef, makeResolverMap(objects));
  const outcome = unwrapOk(result);
  expect(outcome.pages.length).toBe(1);
  expect(outcome.pages[0].mediaBox).toEqual([0, 0, 612, 792]);
});

test("PW-001 (2階層): /Pages → /Kids で末端 /Page を再帰収集する", async () => {
  const rootPages = makeRef(1, 0);
  const leaf1 = makeRef(2, 0);
  const leaf2 = makeRef(3, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    rootPages,
    makePagesDict({
      kids: [leaf1, leaf2],
      mediaBox: [0, 0, 100, 100],
    }),
  );
  addTo(objects, leaf1, makePageDict({ mediaBox: [0, 0, 612, 792] }));
  addTo(objects, leaf2, makePageDict({ mediaBox: [0, 0, 612, 792] }));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(rootPages, makeResolverMap(objects)),
  );
  expect(outcome.pages.length).toBe(2);
});

test("PW-001 (3階層): /Pages → /Pages → /Page でも収集できる", async () => {
  const root = makeRef(1, 0);
  const mid = makeRef(2, 0);
  const leaf = makeRef(3, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({ kids: [mid], mediaBox: [0, 0, 100, 100] }),
  );
  addTo(objects, mid, makePagesDict({ kids: [leaf] }));
  addTo(objects, leaf, makePageDict({}));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages.length).toBe(1);
});

test("継承-MediaBox: 親 /Pages の /MediaBox が子 /Page に継承される", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({ kids: [leaf], mediaBox: [0, 0, 500, 500] }),
  );
  addTo(objects, leaf, makePageDict({}));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].mediaBox).toEqual([0, 0, 500, 500]);
});

test("継承-Resources: 親 /Pages の /Resources が子 /Page に継承される", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const parentResources: PdfDictionary = okDict(
    new Map<string, PdfValue>([["Font", { type: "name", value: "Inherited" }]]),
  );
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({
      kids: [leaf],
      mediaBox: [0, 0, 10, 10],
      resources: parentResources,
    }),
  );
  addTo(objects, leaf, makePageDict({}));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].resources).toBe(parentResources);
});

test("継承-Resources シャドウ: 子 /Page の /Resources は親を置き換える", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const parentResources: PdfDictionary = okDict(
    new Map<string, PdfValue>([["Font", { type: "name", value: "Parent" }]]),
  );
  const childResources: PdfDictionary = okDict(
    new Map<string, PdfValue>([["Font", { type: "name", value: "Child" }]]),
  );
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({
      kids: [leaf],
      mediaBox: [0, 0, 10, 10],
      resources: parentResources,
    }),
  );
  addTo(objects, leaf, makePageDict({ resources: childResources }));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].resources).toBe(childResources);
});

test("継承-CropBox: 親 /Pages に /CropBox があり子 /Page にない場合、継承される", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({
      kids: [leaf],
      mediaBox: [0, 0, 100, 100],
      cropBox: [5, 5, 95, 95],
    }),
  );
  addTo(objects, leaf, makePageDict({}));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].cropBox).toEqual([5, 5, 95, 95]);
});

test("継承-Rotate: 親 /Pages に /Rotate があり子 /Page にない場合、継承される", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({
      kids: [leaf],
      mediaBox: [0, 0, 10, 10],
      rotate: { type: "integer", value: 90 },
    }),
  );
  addTo(objects, leaf, makePageDict({}));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].rotate).toBe(90);
});

test("継承-3階層シャドウ CropBox: 中間ノードの CropBox が採用される", async () => {
  const root = makeRef(1, 0);
  const mid = makeRef(2, 0);
  const leaf = makeRef(3, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({
      kids: [mid],
      mediaBox: [0, 0, 200, 200],
      cropBox: [0, 0, 200, 200],
    }),
  );
  addTo(
    objects,
    mid,
    makePagesDict({ kids: [leaf], cropBox: [10, 10, 190, 190] }),
  );
  addTo(objects, leaf, makePageDict({}));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].cropBox).toEqual([10, 10, 190, 190]);
});

test("継承-3階層シャドウ Rotate: 中間ノードの Rotate が採用される", async () => {
  const root = makeRef(1, 0);
  const mid = makeRef(2, 0);
  const leaf = makeRef(3, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({
      kids: [mid],
      mediaBox: [0, 0, 10, 10],
      rotate: { type: "integer", value: 90 },
    }),
  );
  addTo(
    objects,
    mid,
    makePagesDict({ kids: [leaf], rotate: { type: "integer", value: 180 } }),
  );
  addTo(objects, leaf, makePageDict({}));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].rotate).toBe(180);
});

test("Rotate-IH-001 優先: ページ /Rotate='90'（文字列）、親 /Rotate=90 → 0 + INVALID_ROTATE", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({
      kids: [leaf],
      mediaBox: [0, 0, 10, 10],
      rotate: { type: "integer", value: 90 },
    }),
  );
  addTo(
    objects,
    leaf,
    makePageDict({
      rotate: {
        type: "string",
        value: new Uint8Array(),
        encoding: "literal",
      },
    }),
  );
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].rotate).toBe(0);
  expect(outcome.warnings.some((w) => w.code === "INVALID_ROTATE")).toBe(true);
});

test("PW-003a: /Type が /Font のノードはスキップされ UNKNOWN_PAGE_TYPE 警告", async () => {
  const fontRef = makeRef(9, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    fontRef,
    okDict(
      new Map<string, PdfValue>([["Type", { type: "name", value: "Font" }]]),
    ),
  );
  const outcome = unwrapOk(
    await PageTreeWalker.walk(fontRef, makeResolverMap(objects)),
  );
  expect(outcome.pages.length).toBe(0);
  expect(outcome.warnings.some((w) => w.code === "UNKNOWN_PAGE_TYPE")).toBe(
    true,
  );
});

test("PW-003b: /Type 欠損のノードも UNKNOWN_PAGE_TYPE 警告でスキップ", async () => {
  const ref = makeRef(9, 0);
  const objects = new Map<string, PdfObject>();
  addTo(objects, ref, okDict(new Map<string, PdfValue>()));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(ref, makeResolverMap(objects)),
  );
  expect(outcome.pages.length).toBe(0);
  expect(outcome.warnings.some((w) => w.code === "UNKNOWN_PAGE_TYPE")).toBe(
    true,
  );
});

test("PW-003c: 解決結果が辞書でない場合も UNKNOWN_PAGE_TYPE 警告でスキップ", async () => {
  const ref = makeRef(9, 0);
  const objects = new Map<string, PdfObject>();
  addTo(objects, ref, { type: "integer", value: 42 });
  const outcome = unwrapOk(
    await PageTreeWalker.walk(ref, makeResolverMap(objects)),
  );
  expect(outcome.pages.length).toBe(0);
  expect(outcome.warnings.some((w) => w.code === "UNKNOWN_PAGE_TYPE")).toBe(
    true,
  );
});

test("PW-004: 同一 /Page を 2 度参照する /Kids は 2 回目を PAGE_TREE_CYCLE でスキップ", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(3, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({
      kids: [leaf, leaf],
      mediaBox: [0, 0, 10, 10],
    }),
  );
  addTo(objects, leaf, makePageDict({}));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages.length).toBe(1);
  expect(outcome.warnings.some((w) => w.code === "PAGE_TREE_CYCLE")).toBe(true);
});

test("/Pages の /Kids が非配列なら MISSING_KIDS 警告（不正型メッセージ）で空結果", async () => {
  const root = makeRef(1, 0);
  const objects = new Map<string, PdfObject>();
  const dict = makePagesDict({ mediaBox: [0, 0, 10, 10] });
  dict.entries.set("Kids", { type: "integer", value: 42 });
  addTo(objects, root, dict);
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages.length).toBe(0);
  expect(
    outcome.warnings.some(
      (w) => w.code === "MISSING_KIDS" && w.message.includes("not an array"),
    ),
  ).toBe(true);
});

test("/Pages の /Kids 配列内の非 indirect-ref 要素は UNKNOWN_PAGE_TYPE 警告でスキップ", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const objects = new Map<string, PdfObject>();
  const dict = makePagesDict({
    kids: [leaf],
    mediaBox: [0, 0, 10, 10],
  });
  dict.entries.set("Kids", {
    type: "array",
    elements: [{ type: "integer", value: 99 }, indirectRefValue(2, 0)],
  });
  addTo(objects, root, dict);
  addTo(objects, leaf, makePageDict({}));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages.length).toBe(1);
  expect(
    outcome.warnings.some(
      (w) =>
        w.code === "UNKNOWN_PAGE_TYPE" &&
        w.message.includes("not an indirect-ref"),
    ),
  ).toBe(true);
});

test("PW-005: /Pages に /Kids がない場合、MISSING_KIDS 警告で空結果", async () => {
  const root = makeRef(1, 0);
  const objects = new Map<string, PdfObject>();
  addTo(objects, root, makePagesDict({ mediaBox: [0, 0, 10, 10] }));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages.length).toBe(0);
  expect(outcome.warnings.some((w) => w.code === "MISSING_KIDS")).toBe(true);
});

test("PW-006: /Count と実ページ数が食い違うと COUNT_MISMATCH 警告（実数採用）", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({
      kids: [leaf],
      count: 99,
      mediaBox: [0, 0, 10, 10],
    }),
  );
  addTo(objects, leaf, makePageDict({}));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages.length).toBe(1);
  expect(outcome.warnings.some((w) => w.code === "COUNT_MISMATCH")).toBe(true);
});

test("PW-007: 深度 51 の /Pages チェーンで PAGE_TREE_TOO_DEEP 警告 + 走査停止", async () => {
  const objects = new Map<string, PdfObject>();
  const depth = 52;
  const refs: IndirectRef[] = [];
  for (let i = 1; i <= depth; i++) {
    refs.push(makeRef(i, 0));
  }
  for (let i = 0; i < depth - 1; i++) {
    addTo(
      objects,
      refs[i],
      makePagesDict({ kids: [refs[i + 1]], mediaBox: [0, 0, 10, 10] }),
    );
  }
  addTo(objects, refs[depth - 1], makePageDict({}));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(refs[0], makeResolverMap(objects)),
  );
  expect(outcome.warnings.some((w) => w.code === "PAGE_TREE_TOO_DEEP")).toBe(
    true,
  );
  expect(outcome.pages.length).toBe(0);
});

test("PW-008a: /Pages 側 /Resources indirect-ref で resolver Err → RESOURCES_RESOLVE_FAILED + 走査継続", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const resourcesRef = makeRef(9, 0);
  const successMap = new Map<string, PdfObject>();
  addTo(
    successMap,
    root,
    makePagesDict({
      kids: [leaf],
      mediaBox: [0, 0, 10, 10],
      resourcesRef,
    }),
  );
  addTo(successMap, leaf, makePageDict({}));
  const resolver = makeFailingResolver(
    "9-0",
    {
      code: "CIRCULAR_REFERENCE",
      message: "cycle",
      objectId: resourcesRef,
    },
    successMap,
  );
  const outcome = unwrapOk(await PageTreeWalker.walk(root, resolver));
  expect(outcome.pages.length).toBe(1);
  expect(
    outcome.warnings.some((w) => w.code === "RESOURCES_RESOLVE_FAILED"),
  ).toBe(true);
  expect(outcome.pages[0].resources.entries.size).toBe(0);
});

test("PW-008b: /Page 側 /Resources indirect-ref で resolver Err → RESOURCES_RESOLVE_FAILED + 空辞書継承", async () => {
  const pageRef = makeRef(2, 0);
  const resourcesRef = makeRef(9, 0);
  const successMap = new Map<string, PdfObject>();
  addTo(
    successMap,
    pageRef,
    makePageDict({ mediaBox: [0, 0, 10, 10], resourcesRef }),
  );
  const resolver = makeFailingResolver(
    "9-0",
    {
      code: "CIRCULAR_REFERENCE",
      message: "cycle",
      objectId: resourcesRef,
    },
    successMap,
  );
  const outcome = unwrapOk(await PageTreeWalker.walk(pageRef, resolver));
  expect(outcome.pages.length).toBe(1);
  expect(
    outcome.warnings.some((w) => w.code === "RESOURCES_RESOLVE_FAILED"),
  ).toBe(true);
  expect(outcome.pages[0].resources.entries.size).toBe(0);
});

test("/Resources が直接配置の非辞書（integer 等）でも RESOURCES_RESOLVE_FAILED 警告 + 走査継続", async () => {
  const pageRef = makeRef(2, 0);
  const objects = new Map<string, PdfObject>();
  const dict = makePageDict({ mediaBox: [0, 0, 10, 10] });
  dict.entries.set("Resources", { type: "integer", value: 7 });
  addTo(objects, pageRef, dict);
  const outcome = unwrapOk(
    await PageTreeWalker.walk(pageRef, makeResolverMap(objects)),
  );
  expect(outcome.pages.length).toBe(1);
  expect(
    outcome.warnings.some(
      (w) =>
        w.code === "RESOURCES_RESOLVE_FAILED" &&
        w.message.includes("unexpected direct type"),
    ),
  ).toBe(true);
  expect(outcome.pages[0].resources.entries.size).toBe(0);
});

test("PW-008c: /Resources 解決結果が dictionary でない場合も RESOURCES_RESOLVE_FAILED + 走査継続", async () => {
  const pageRef = makeRef(2, 0);
  const resourcesRef = makeRef(9, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    pageRef,
    makePageDict({ mediaBox: [0, 0, 10, 10], resourcesRef }),
  );
  addTo(objects, resourcesRef, { type: "integer", value: 42 });
  const outcome = unwrapOk(
    await PageTreeWalker.walk(pageRef, makeResolverMap(objects)),
  );
  expect(outcome.pages.length).toBe(1);
  expect(
    outcome.warnings.some((w) => w.code === "RESOURCES_RESOLVE_FAILED"),
  ).toBe(true);
  expect(outcome.pages[0].resources.entries.size).toBe(0);
});

test("IH-001 統合: ページ /Resources が indirect-ref でも親を完全シャドウイングする", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const childResourcesRef = makeRef(10, 0);
  const childResources: PdfDictionary = okDict(
    new Map<string, PdfValue>([["Font", { type: "name", value: "Child" }]]),
  );
  const parentResources: PdfDictionary = okDict(
    new Map<string, PdfValue>([["Font", { type: "name", value: "Parent" }]]),
  );
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({
      kids: [leaf],
      mediaBox: [0, 0, 10, 10],
      resources: parentResources,
    }),
  );
  addTo(objects, leaf, makePageDict({ resourcesRef: childResourcesRef }));
  addTo(objects, childResourcesRef, childResources);
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].resources).toBe(childResources);
});

test("IH-003 伝播: 末端 /Page に /MediaBox が無ければ MEDIABOX_NOT_FOUND で Err", async () => {
  const pageRef = makeRef(2, 0);
  const objects = new Map<string, PdfObject>();
  addTo(objects, pageRef, makePageDict({}));
  const error = unwrapErr(
    await PageTreeWalker.walk(pageRef, makeResolverMap(objects)),
  );
  expect(error.code).toBe("MEDIABOX_NOT_FOUND");
});

test("Resolver-Err 伝播: resolveRef が Err を返したら PdfError を伝播する", async () => {
  const ref = makeRef(1, 0);
  const resolver: ResolveRef = makeResolverStub(async () => ({
    ok: false,
    error: {
      code: "CIRCULAR_REFERENCE",
      message: "cycle",
      objectId: ref,
    },
  }));
  const error = unwrapErr(await PageTreeWalker.walk(ref, resolver));
  expect(error.code).toBe("CIRCULAR_REFERENCE");
});

test("warnings-順序: 発生順に蓄積される", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({
      kids: [leaf, leaf],
      count: 99,
      mediaBox: [0, 0, 10, 10],
    }),
  );
  addTo(objects, leaf, makePageDict({}));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  const codes = outcome.warnings.map((w) => w.code);
  const cycleIdx = codes.indexOf("PAGE_TREE_CYCLE");
  const countIdx = codes.indexOf("COUNT_MISMATCH");
  expect(cycleIdx).toBeGreaterThanOrEqual(0);
  expect(countIdx).toBeGreaterThanOrEqual(0);
  expect(cycleIdx).toBeLessThan(countIdx);
});

test("空 /Kids 配列ならページ 0 件で Ok", async () => {
  const root = makeRef(1, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({
      kids: [],
      mediaBox: [0, 0, 10, 10],
    }),
  );
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages.length).toBe(0);
  expect(outcome.warnings.some((w) => w.code === "MISSING_KIDS")).toBe(false);
});

test("/Contents が indirect-ref の /Page で正しく読み取られる", async () => {
  const pageRef = makeRef(2, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    pageRef,
    makePageDict({
      mediaBox: [0, 0, 10, 10],
      contents: indirectRefValue(7, 0),
    }),
  );
  const outcome = unwrapOk(
    await PageTreeWalker.walk(pageRef, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].contents).not.toBeNull();
});
