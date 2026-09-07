import { expect, test } from "vitest";
import type { PdfWarning } from "../../../../pdf/errors/warning/index";
import type {
  PdfObject,
  PdfValue,
} from "../../../../pdf/types/pdf-types/index";
import {
  indirectRefValue,
  makeResolverMap,
  makeResolverStub,
} from "../../page-tree-walker/__tests__/page-tree-walker.test.helpers";
import { type ResolveValueContext, ValueResolver } from "../../value-resolver";

const LETTER_ELEMENTS: PdfValue[] = [
  { type: "integer", value: 0 },
  { type: "integer", value: 0 },
  { type: "integer", value: 612 },
  { type: "integer", value: 792 },
];

/**
 * 呼び出し回数を検証できる `ResolveRef` スタブ。
 * マップに無いキーは `CIRCULAR_REFERENCE` Err になる。
 *
 * @param map - 参照先オブジェクトのマップ
 * @returns vitest Mock でラップした ResolveRef
 */
const okResolver = (
  map: Map<string, PdfObject>,
): ReturnType<typeof makeResolverStub> =>
  makeResolverStub(makeResolverMap(map));

/**
 * `ResolveValueContext` を組み立てる（warnings は呼び出し側で参照する）。
 *
 * @param warnings - 警告蓄積先
 * @param resolveRef - 間接参照解決関数
 * @param key - 辞書キー名（既定: MediaBox）
 * @param warningCode - 解決失敗時の警告コード（既定: PAGE_ATTR_RESOLVE_FAILED）
 * @returns 解決文脈
 */
const makeCtx = (
  warnings: PdfWarning[],
  resolveRef: ResolveValueContext["resolveRef"],
  key = "MediaBox",
  warningCode: ResolveValueContext["warningCode"] = "PAGE_ATTR_RESOLVE_FAILED",
): ResolveValueContext => ({ key, resolveRef, warnings, warningCode });

test("ValueResolver.value は直値をそのまま返し resolveRef を呼ばない", async () => {
  const warnings: PdfWarning[] = [];
  const resolver = okResolver(new Map());
  const value: PdfValue = { type: "array", elements: LETTER_ELEMENTS };
  const got = await ValueResolver.value(value, makeCtx(warnings, resolver));
  expect(got).toEqual({ some: true, value });
  expect(warnings).toEqual([]);
  expect(resolver).not.toHaveBeenCalled();
});

test("ValueResolver.value は値自体の間接参照を 1 段解決する", async () => {
  const warnings: PdfWarning[] = [];
  const target: PdfValue = { type: "array", elements: LETTER_ELEMENTS };
  const resolver = okResolver(new Map<string, PdfObject>([["10-0", target]]));
  const got = await ValueResolver.value(
    indirectRefValue(10, 0),
    makeCtx(warnings, resolver),
  );
  expect(got).toEqual({ some: true, value: target });
  expect(warnings).toEqual([]);
});

test("ValueResolver.valueWithElements は配列要素の間接参照を解決する", async () => {
  const warnings: PdfWarning[] = [];
  const resolver = okResolver(
    new Map<string, PdfObject>([["11-0", { type: "integer", value: 612 }]]),
  );
  const value: PdfValue = {
    type: "array",
    elements: [
      { type: "integer", value: 0 },
      { type: "integer", value: 0 },
      indirectRefValue(11, 0),
      { type: "integer", value: 792 },
    ],
  };
  const got = await ValueResolver.valueWithElements(
    value,
    makeCtx(warnings, resolver),
  );
  expect(got).toEqual({
    some: true,
    value: { type: "array", elements: LETTER_ELEMENTS },
  });
  expect(warnings).toEqual([]);
});

test("ValueResolver.value は配列要素の間接参照を解決しない", async () => {
  const warnings: PdfWarning[] = [];
  const resolver = okResolver(new Map());
  const value: PdfValue = {
    type: "array",
    elements: [indirectRefValue(3, 0)],
  };
  const got = await ValueResolver.value(
    value,
    makeCtx(warnings, resolver, "Kids"),
  );
  expect(got).toEqual({ some: true, value });
  expect(resolver).not.toHaveBeenCalled();
});

test("ValueResolver.valueWithElements は値の参照を解決した先の配列要素も解決する", async () => {
  const warnings: PdfWarning[] = [];
  const resolver = okResolver(
    new Map<string, PdfObject>([
      [
        "10-0",
        {
          type: "array",
          elements: [
            { type: "integer", value: 0 },
            { type: "integer", value: 0 },
            indirectRefValue(11, 0),
            { type: "integer", value: 792 },
          ],
        },
      ],
      ["11-0", { type: "integer", value: 612 }],
    ]),
  );
  const got = await ValueResolver.valueWithElements(
    indirectRefValue(10, 0),
    makeCtx(warnings, resolver),
  );
  expect(got).toEqual({
    some: true,
    value: { type: "array", elements: LETTER_ELEMENTS },
  });
  expect(warnings).toEqual([]);
});

test("ValueResolver.valueWithElements は参照要素を含まない配列を再構築しない", async () => {
  const warnings: PdfWarning[] = [];
  const resolver = okResolver(new Map());
  const value: PdfValue = { type: "array", elements: LETTER_ELEMENTS };
  const got = await ValueResolver.valueWithElements(
    value,
    makeCtx(warnings, resolver),
  );
  expect(got.some).toBe(true);
  expect(got.some && got.value).toBe(value);
  expect(resolver).not.toHaveBeenCalled();
});

test("ValueResolver.value は resolveRef が Err のとき None + cause 付き警告", async () => {
  const warnings: PdfWarning[] = [];
  const resolver = okResolver(new Map());
  const got = await ValueResolver.value(
    indirectRefValue(10, 0),
    makeCtx(warnings, resolver),
  );
  expect(got).toEqual({ some: false });
  expect(warnings).toEqual([
    {
      code: "PAGE_ATTR_RESOLVE_FAILED",
      message:
        "Failed to resolve /MediaBox indirect-ref 10 0: cause=CIRCULAR_REFERENCE",
    },
  ]);
});

test("ValueResolver.value は世代番号が不正な間接参照で None + 警告", async () => {
  const warnings: PdfWarning[] = [];
  const resolver = okResolver(new Map());
  const got = await ValueResolver.value(
    indirectRefValue(10, -1),
    makeCtx(warnings, resolver),
  );
  expect(got).toEqual({ some: false });
  expect(warnings).toEqual([
    {
      code: "PAGE_ATTR_RESOLVE_FAILED",
      message:
        "Failed to resolve /MediaBox indirect-ref 10 -1: invalid indirect reference",
    },
  ]);
  expect(resolver).not.toHaveBeenCalled();
});

test("ValueResolver.value は解決先が stream のとき None + 警告", async () => {
  const warnings: PdfWarning[] = [];
  const resolver = okResolver(
    new Map<string, PdfObject>([
      [
        "10-0",
        {
          type: "stream",
          dictionary: { type: "dictionary", entries: new Map() },
          data: new Uint8Array(),
        },
      ],
    ]),
  );
  const got = await ValueResolver.value(
    indirectRefValue(10, 0),
    makeCtx(warnings, resolver),
  );
  expect(got).toEqual({ some: false });
  expect(warnings).toEqual([
    {
      code: "PAGE_ATTR_RESOLVE_FAILED",
      message:
        "Failed to resolve /MediaBox indirect-ref 10 0: resolved to stream",
    },
  ]);
});

test("ValueResolver.valueWithElements は解決できない要素を元の参照のまま残し警告を 1 件積む", async () => {
  const warnings: PdfWarning[] = [];
  const resolver = okResolver(new Map());
  const failing = indirectRefValue(99, 0);
  const value: PdfValue = {
    type: "array",
    elements: [
      { type: "integer", value: 0 },
      { type: "integer", value: 0 },
      failing,
      { type: "integer", value: 792 },
    ],
  };
  const got = await ValueResolver.valueWithElements(
    value,
    makeCtx(warnings, resolver),
  );
  expect(got).toEqual({
    some: true,
    value: {
      type: "array",
      elements: [
        { type: "integer", value: 0 },
        { type: "integer", value: 0 },
        failing,
        { type: "integer", value: 792 },
      ],
    },
  });
  expect(warnings.length).toBe(1);
  expect(warnings[0].code).toBe("PAGE_ATTR_RESOLVE_FAILED");
});

test("ValueResolver.value は解決先がさらに間接参照でも 1 段しか解決しない", async () => {
  const warnings: PdfWarning[] = [];
  const inner = indirectRefValue(11, 0);
  const resolver = okResolver(new Map<string, PdfObject>([["10-0", inner]]));
  const got = await ValueResolver.value(
    indirectRefValue(10, 0),
    makeCtx(warnings, resolver),
  );
  expect(got).toEqual({ some: true, value: inner });
  expect(resolver).toHaveBeenCalledTimes(1);
});

test("ValueResolver は文脈で指定された警告コードで警告を積む", async () => {
  const warnings: PdfWarning[] = [];
  const resolver = okResolver(new Map());
  await ValueResolver.value(
    indirectRefValue(10, 0),
    makeCtx(warnings, resolver, "Resources", "RESOURCES_RESOLVE_FAILED"),
  );
  expect(warnings).toEqual([
    {
      code: "RESOURCES_RESOLVE_FAILED",
      message:
        "Failed to resolve /Resources indirect-ref 10 0: cause=CIRCULAR_REFERENCE",
    },
  ]);
});
