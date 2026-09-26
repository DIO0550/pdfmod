import { expect, test } from "vitest";
import type {
  IndirectRef,
  PdfDictionary,
  PdfObject,
  PdfValue,
} from "../../../../pdf/types/pdf-types/index";
import type { ResolveRef } from "../../../../pdf/types/resolve-ref/index";
import { PageTreeWalker } from "../../page-tree-walker";
import {
  indirectRefValue,
  makeFailingResolver,
  makeNumberArray,
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

test("単一 /Page ノードから ResolvedPage 1 件が生成される", async () => {
  const pageRef = makeRef(2, 0);
  const page = makePageDict({ mediaBox: [0, 0, 612, 792] });
  const objects = new Map<string, PdfObject>();
  addTo(objects, pageRef, page);
  const result = await PageTreeWalker.walk(pageRef, makeResolverMap(objects));
  const outcome = unwrapOk(result);
  expect(outcome.pages.length).toBe(1);
  expect(outcome.pages[0].mediaBox).toEqual([0, 0, 612, 792]);
});

test("2階層の /Pages → /Kids で末端 /Page を再帰収集する", async () => {
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

test("3階層の /Pages → /Pages → /Page でも収集できる", async () => {
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

test("正規化-MediaBox 継承: 親 /Pages の /MediaBox が対角逆順でも子 /Page では正規化済み", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({ kids: [leaf], mediaBox: [500, 500, 0, 0] }),
  );
  addTo(objects, leaf, makePageDict({}));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].mediaBox).toEqual([0, 0, 500, 500]);
  expect(outcome.warnings).toEqual([]);
});

test("正規化-CropBox 直属: 子 /Page の /CropBox が対角逆順でも正規化済みで、MediaBox は影響を受けない", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({ kids: [leaf], mediaBox: [0, 0, 612, 792] }),
  );
  addTo(objects, leaf, makePageDict({ cropBox: [600, 700, 10, 20] }));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].mediaBox).toEqual([0, 0, 612, 792]);
  expect(outcome.pages[0].cropBox).toEqual([10, 20, 600, 700]);
  expect(outcome.warnings).toEqual([]);
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

test("ページ /Rotate が文字列、親 /Rotate=90 → 継承 90 + INVALID_ROTATE（無効な局所値は無視）", async () => {
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
  expect(outcome.pages[0].rotate).toBe(90);
  expect(outcome.warnings.some((w) => w.code === "INVALID_ROTATE")).toBe(true);
});

test("/Type が /Font のノードはスキップされ UNKNOWN_PAGE_TYPE 警告", async () => {
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

test("/Type 欠損のノードも UNKNOWN_PAGE_TYPE 警告でスキップ", async () => {
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

test("解決結果が辞書でない場合も UNKNOWN_PAGE_TYPE 警告でスキップ", async () => {
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

test("同一 /Page を 2 度参照する /Kids は 2 回目を PAGE_TREE_CYCLE でスキップ", async () => {
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

test("/Pages に /Kids がない場合、MISSING_KIDS 警告で空結果", async () => {
  const root = makeRef(1, 0);
  const objects = new Map<string, PdfObject>();
  addTo(objects, root, makePagesDict({ mediaBox: [0, 0, 10, 10] }));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages.length).toBe(0);
  expect(outcome.warnings.some((w) => w.code === "MISSING_KIDS")).toBe(true);
});

test("/Count と実ページ数が食い違うと COUNT_MISMATCH 警告（実数採用）", async () => {
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

test("深度 51 の /Pages チェーンで PAGE_TREE_TOO_DEEP 警告 + 走査停止", async () => {
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

test("/Pages 側 /Resources indirect-ref で resolver Err → RESOURCES_RESOLVE_FAILED + 走査継続", async () => {
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

test("/Page 側 /Resources indirect-ref で resolver Err → RESOURCES_RESOLVE_FAILED + 空辞書継承", async () => {
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

test("/Resources 解決結果が dictionary でない場合も RESOURCES_RESOLVE_FAILED + 走査継続", async () => {
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

test("ページ /Resources が invalid（解決失敗）なら親の /Resources を継承する", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const childResourcesRef = makeRef(10, 0);
  const parentResources: PdfDictionary = okDict(
    new Map<string, PdfValue>([["Font", { type: "name", value: "Parent" }]]),
  );
  const successMap = new Map<string, PdfObject>();
  addTo(
    successMap,
    root,
    makePagesDict({
      kids: [leaf],
      mediaBox: [0, 0, 10, 10],
      resources: parentResources,
    }),
  );
  addTo(successMap, leaf, makePageDict({ resourcesRef: childResourcesRef }));
  const resolver = makeFailingResolver(
    "10-0",
    {
      code: "CIRCULAR_REFERENCE",
      message: "cycle",
      objectId: childResourcesRef,
    },
    successMap,
  );
  const outcome = unwrapOk(await PageTreeWalker.walk(root, resolver));
  expect(outcome.pages.length).toBe(1);
  expect(outcome.pages[0].resources).toBe(parentResources);
  expect(
    outcome.warnings.some((w) => w.code === "RESOURCES_RESOLVE_FAILED"),
  ).toBe(true);
});

test("ページ /Resources が indirect-ref でも親を完全シャドウイングする", async () => {
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

test("末端 /Page に /MediaBox が無ければ MEDIABOX_NOT_FOUND で Err", async () => {
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
  expect(outcome.pages[0].contents.some).toBe(true);
});

test("間接参照-MediaBox: /Page の /MediaBox が間接参照でも解決される", async () => {
  const pageRef = makeRef(2, 0);
  const boxRef = makeRef(10, 0);
  const objects = new Map<string, PdfObject>();
  addTo(objects, pageRef, makePageDict({ mediaBoxRef: boxRef }));
  addTo(objects, boxRef, makeNumberArray([0, 0, 612, 792]));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(pageRef, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].mediaBox).toEqual([0, 0, 612, 792]);
  expect(outcome.warnings).toEqual([]);
});

test("間接参照-MediaBox 継承: /Pages の /MediaBox が間接参照でも子へ継承される", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const boxRef = makeRef(10, 0);
  const objects = new Map<string, PdfObject>();
  addTo(objects, root, makePagesDict({ kids: [leaf], mediaBoxRef: boxRef }));
  addTo(objects, leaf, makePageDict({}));
  addTo(objects, boxRef, makeNumberArray([0, 0, 500, 500]));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].mediaBox).toEqual([0, 0, 500, 500]);
  expect(outcome.warnings).toEqual([]);
});

test("間接参照-MediaBox 要素: 配列要素が間接参照でも解決される", async () => {
  const pageRef = makeRef(2, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    pageRef,
    makePageDict({
      mediaBoxValue: {
        type: "array",
        elements: [
          { type: "integer", value: 0 },
          { type: "integer", value: 0 },
          indirectRefValue(10, 0),
          { type: "integer", value: 792 },
        ],
      },
    }),
  );
  addTo(objects, makeRef(10, 0), { type: "integer", value: 612 });
  const outcome = unwrapOk(
    await PageTreeWalker.walk(pageRef, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].mediaBox).toEqual([0, 0, 612, 792]);
  expect(outcome.warnings).toEqual([]);
});

test("間接参照-CropBox: /CropBox が間接参照でも解決される", async () => {
  const pageRef = makeRef(2, 0);
  const cropRef = makeRef(11, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    pageRef,
    makePageDict({ mediaBox: [0, 0, 100, 100], cropBoxRef: cropRef }),
  );
  addTo(objects, cropRef, makeNumberArray([5, 5, 95, 95]));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(pageRef, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].cropBox).toEqual([5, 5, 95, 95]);
  expect(outcome.warnings).toEqual([]);
});

test("間接参照-Rotate: /Rotate が間接参照でも解決される", async () => {
  const pageRef = makeRef(2, 0);
  const rotateRef = makeRef(11, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    pageRef,
    makePageDict({ mediaBox: [0, 0, 10, 10], rotateRef }),
  );
  addTo(objects, rotateRef, { type: "integer", value: 90 });
  const outcome = unwrapOk(
    await PageTreeWalker.walk(pageRef, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].rotate).toBe(90);
  expect(outcome.warnings).toEqual([]);
});

test("解決失敗-MediaBox: 参照が解決できないと PAGE_ATTR_RESOLVE_FAILED + 祖先の値を採用", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({ kids: [leaf], mediaBox: [0, 0, 500, 500] }),
  );
  addTo(objects, leaf, makePageDict({ mediaBoxRef: makeRef(99, 0) }));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].mediaBox).toEqual([0, 0, 500, 500]);
  expect(
    outcome.warnings.filter((w) => w.code === "PAGE_ATTR_RESOLVE_FAILED")
      .length,
  ).toBe(1);
});

test("malformed-MediaBox: 局所値が非配列なら INVALID_MEDIABOX + 祖先の値を採用", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({ kids: [leaf], mediaBox: [0, 0, 500, 500] }),
  );
  addTo(
    objects,
    leaf,
    makePageDict({
      mediaBoxValue: {
        type: "string",
        value: new Uint8Array(),
        encoding: "literal",
      },
    }),
  );
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].mediaBox).toEqual([0, 0, 500, 500]);
  expect(
    outcome.warnings.filter((w) => w.code === "INVALID_MEDIABOX").length,
  ).toBe(1);
});

test("malformed-MediaBox: 祖先にも有効な /MediaBox が無ければ MEDIABOX_NOT_FOUND のまま", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const objects = new Map<string, PdfObject>();
  addTo(objects, root, makePagesDict({ kids: [leaf] }));
  addTo(
    objects,
    leaf,
    makePageDict({
      mediaBoxValue: {
        type: "string",
        value: new Uint8Array(),
        encoding: "literal",
      },
    }),
  );
  const error = unwrapErr(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(error.code).toBe("MEDIABOX_NOT_FOUND");
});

test("解放済みオブジェクト-MediaBox: null に解決されると INVALID_MEDIABOX + 継承値", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const boxRef = makeRef(10, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({ kids: [leaf], mediaBox: [0, 0, 500, 500] }),
  );
  addTo(objects, leaf, makePageDict({ mediaBoxRef: boxRef }));
  addTo(objects, boxRef, { type: "null" });
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].mediaBox).toEqual([0, 0, 500, 500]);
  expect(outcome.warnings.some((w) => w.code === "INVALID_MEDIABOX")).toBe(
    true,
  );
});

test("malformed-CropBox: 局所値が無効なら INVALID_CROPBOX + 祖先の CropBox を採用", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({
      kids: [leaf],
      mediaBox: [0, 0, 100, 100],
      cropBox: [10, 10, 90, 90],
    }),
  );
  addTo(
    objects,
    leaf,
    makePageDict({ cropBoxValue: { type: "integer", value: 42 } }),
  );
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].cropBox).toEqual([10, 10, 90, 90]);
  expect(
    outcome.warnings.filter((w) => w.code === "INVALID_CROPBOX").length,
  ).toBe(1);
});

test("要素だけ解決失敗-MediaBox: PAGE_ATTR_RESOLVE_FAILED + INVALID_MEDIABOX を各 1 件積み継承値を採用", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({ kids: [leaf], mediaBox: [0, 0, 500, 500] }),
  );
  addTo(
    objects,
    leaf,
    makePageDict({
      mediaBoxValue: {
        type: "array",
        elements: [
          { type: "integer", value: 0 },
          { type: "integer", value: 0 },
          indirectRefValue(99, 0),
          { type: "integer", value: 792 },
        ],
      },
    }),
  );
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].mediaBox).toEqual([0, 0, 500, 500]);
  expect(
    outcome.warnings.filter((w) => w.code === "PAGE_ATTR_RESOLVE_FAILED")
      .length,
  ).toBe(1);
  expect(
    outcome.warnings.filter((w) => w.code === "INVALID_MEDIABOX").length,
  ).toBe(1);
});

test("解決失敗-CropBox/Rotate: どちらも解決できなくても継承値へ落ちる", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({
      kids: [leaf],
      mediaBox: [0, 0, 100, 100],
      cropBox: [10, 10, 90, 90],
      rotate: { type: "integer", value: 90 },
    }),
  );
  addTo(
    objects,
    leaf,
    makePageDict({ cropBoxRef: makeRef(98, 0), rotateRef: makeRef(97, 0) }),
  );
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages[0].cropBox).toEqual([10, 10, 90, 90]);
  expect(outcome.pages[0].rotate).toBe(90);
  expect(
    outcome.warnings.filter((w) => w.code === "PAGE_ATTR_RESOLVE_FAILED")
      .length,
  ).toBe(2);
});

test("間接参照-Kids: /Kids 自体が間接参照でも子ページを収集する", async () => {
  const root = makeRef(1, 0);
  const leaf = makeRef(2, 0);
  const kidsRef = makeRef(20, 0);
  const objects = new Map<string, PdfObject>();
  addTo(objects, root, makePagesDict({ kidsRef, mediaBox: [0, 0, 10, 10] }));
  addTo(objects, kidsRef, {
    type: "array",
    elements: [indirectRefValue(2, 0)],
  });
  addTo(objects, leaf, makePageDict({}));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages.length).toBe(1);
  expect(outcome.warnings).toEqual([]);
});

test("解決失敗-Kids: /Kids 参照が解決できないと PAGE_ATTR_RESOLVE_FAILED + MISSING_KIDS", async () => {
  const root = makeRef(1, 0);
  const objects = new Map<string, PdfObject>();
  addTo(
    objects,
    root,
    makePagesDict({ kidsRef: makeRef(20, 0), mediaBox: [0, 0, 10, 10] }),
  );
  const outcome = unwrapOk(
    await PageTreeWalker.walk(root, makeResolverMap(objects)),
  );
  expect(outcome.pages.length).toBe(0);
  expect(
    outcome.warnings.some((w) => w.code === "PAGE_ATTR_RESOLVE_FAILED"),
  ).toBe(true);
  expect(outcome.warnings.some((w) => w.code === "MISSING_KIDS")).toBe(true);
});

test("深度ちょうど 50 の /Pages チェーンは警告なしで走査できる", async () => {
  const objects = new Map<string, PdfObject>();
  const nodeCount = 51;
  const refs: IndirectRef[] = [];
  for (let i = 1; i <= nodeCount; i++) {
    refs.push(makeRef(i, 0));
  }
  for (let i = 0; i < nodeCount - 1; i++) {
    addTo(
      objects,
      refs[i],
      makePagesDict({ kids: [refs[i + 1]], mediaBox: [0, 0, 10, 10] }),
    );
  }
  addTo(objects, refs[nodeCount - 1], makePageDict({}));
  const outcome = unwrapOk(
    await PageTreeWalker.walk(refs[0], makeResolverMap(objects)),
  );
  expect(outcome.pages.length).toBe(1);
  expect(outcome.warnings.some((w) => w.code === "PAGE_TREE_TOO_DEEP")).toBe(
    false,
  );
});

test("直値のみの辞書では属性解決のための resolveRef が発生しない", async () => {
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
      rotate: { type: "integer", value: 90 },
    }),
  );
  addTo(objects, leaf, makePageDict({}));
  const resolver = makeResolverStub(makeResolverMap(objects));
  const outcome = unwrapOk(await PageTreeWalker.walk(root, resolver));
  expect(outcome.pages.length).toBe(1);
  // ノード自身の解決 2 回（root / leaf）のみ。属性解決の追加呼び出しは無い。
  expect(resolver).toHaveBeenCalledTimes(2);
});
