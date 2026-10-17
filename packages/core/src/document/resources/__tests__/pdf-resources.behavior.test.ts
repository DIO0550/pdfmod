import { expect, test } from "vitest";
import type { PdfError } from "../../../pdf/errors/index";
import type {
  IndirectRef,
  PdfDictionary,
  PdfIndirectRef,
  PdfObject,
  PdfStream,
  PdfValue,
} from "../../../pdf/types/pdf-types/index";
import type { ResolveRef } from "../../../pdf/types/resolve-ref/index";
import type { Result } from "../../../utils/result/index";
import { PdfResources } from "../index";

const unwrapOk = <T>(result: Result<T, unknown>): T => {
  expect(result.ok).toBe(true);
  return (result as { ok: true; value: T }).value;
};

const unwrapErr = <E>(result: Result<unknown, E>): E => {
  expect(result.ok).toBe(false);
  return (result as { ok: false; error: E }).error;
};

const indirectRefValue = (objNum: number, genNum = 0): PdfIndirectRef => ({
  type: "indirect-ref",
  objectNumber: objNum,
  generationNumber: genNum,
});

const makeDict = (entries: [string, PdfValue][] = []): PdfDictionary => ({
  type: "dictionary",
  entries: new Map(entries),
});

const makeStream = (
  dict: PdfDictionary = makeDict(),
  data: Uint8Array = new Uint8Array(),
): PdfStream => ({
  type: "stream",
  dictionary: dict,
  data,
});

const createStubResolver = (
  store: Map<string, PdfObject | Result<PdfObject, PdfError>>,
  onResolve?: (ref: IndirectRef) => void,
): ResolveRef => {
  return async (ref: IndirectRef) => {
    onResolve?.(ref);
    const key = `${ref.objectNumber}-${ref.generationNumber}`;
    const target = store.get(key);
    if (!target) {
      return {
        ok: false,
        error: {
          code: "OBJECT_NOT_FOUND" as const,
          message: `Object ${key} not found`,
        } as unknown as PdfError,
      };
    }
    if ("ok" in target && typeof target.ok === "boolean") {
      return target;
    }
    return { ok: true, value: target as PdfObject };
  };
};

test("TC-01: 直値カテゴリ辞書と直値エントリの取得 (Font)", async () => {
  const fontDict = makeDict([["Type", { type: "name", value: "Font" }]]);
  const resourcesDict = makeDict([["Font", makeDict([["F1", fontDict]])]]);
  const resources = PdfResources.from(resourcesDict);
  const resolver = createStubResolver(new Map());

  const result = await PdfResources.lookup(resources, "Font", "F1", resolver);
  const opt = unwrapOk(result);
  expect(opt.some).toBe(true);
  if (opt.some) {
    expect(opt.value).toBe(fontDict);
  }
});

test("TC-02: 間接参照カテゴリ辞書の解決", async () => {
  const fontDict = makeDict([["Type", { type: "name", value: "Font" }]]);
  const catDict = makeDict([["F1", fontDict]]);
  const resources = PdfResources.from(
    makeDict([["Font", indirectRefValue(2, 0)]]),
  );
  const resolver = createStubResolver(new Map([["2-0", catDict]]));

  const result = await PdfResources.lookup(resources, "Font", "F1", resolver);
  const opt = unwrapOk(result);
  expect(opt.some).toBe(true);
  if (opt.some) {
    expect(opt.value).toBe(fontDict);
  }
});

test("TC-03: 間接参照エントリ（フォント辞書）の解決", async () => {
  const fontDict = makeDict([["Type", { type: "name", value: "Font" }]]);
  const resources = PdfResources.from(
    makeDict([["Font", makeDict([["F1", indirectRefValue(3, 0)]])]]),
  );
  const resolver = createStubResolver(new Map([["3-0", fontDict]]));

  const result = await PdfResources.lookup(resources, "Font", "F1", resolver);
  const opt = unwrapOk(result);
  expect(opt.some).toBe(true);
  if (opt.some) {
    expect(opt.value).toBe(fontDict);
  }
});

test("TC-04: 間接参照エントリ（XObjectストリーム）の解決", async () => {
  const xobjectStream = makeStream(
    makeDict([
      ["Type", { type: "name", value: "XObject" }],
      ["Subtype", { type: "name", value: "Image" }],
    ]),
    new Uint8Array([1, 2, 3]),
  );
  const resources = PdfResources.from(
    makeDict([["XObject", makeDict([["Im1", indirectRefValue(4, 0)]])]]),
  );
  const resolver = createStubResolver(new Map([["4-0", xobjectStream]]));

  const result = await PdfResources.lookup(
    resources,
    "XObject",
    "Im1",
    resolver,
  );
  const opt = unwrapOk(result);
  expect(opt.some).toBe(true);
  if (opt.some) {
    expect(opt.value).toBe(xobjectStream);
  }
});

test("TC-05: 未知カテゴリ辞書・エントリの保持と解決 (/CustomCat)", async () => {
  const customDict = makeDict([["Data", { type: "integer", value: 123 }]]);
  const resources = PdfResources.from(
    makeDict([["CustomCat", makeDict([["Item1", indirectRefValue(5, 0)]])]]),
  );
  const resolver = createStubResolver(new Map([["5-0", customDict]]));

  const result = await PdfResources.lookup(
    resources,
    "CustomCat",
    "Item1",
    resolver,
  );
  const opt = unwrapOk(result);
  expect(opt.some).toBe(true);
  if (opt.some) {
    expect(opt.value).toBe(customDict);
  }
});

test("TC-06: 存在しないカテゴリ名の指定", async () => {
  const resources = PdfResources.from(makeDict([["Font", makeDict()]]));
  const resolver = createStubResolver(new Map());

  const result = await PdfResources.lookup(
    resources,
    "Shading",
    "S1",
    resolver,
  );
  const opt = unwrapOk(result);
  expect(opt.some).toBe(false);
});

test("TC-07: 存在しないエントリ名の指定", async () => {
  const resources = PdfResources.from(
    makeDict([["Font", makeDict([["F1", makeDict()]])]]),
  );
  const resolver = createStubResolver(new Map());

  const result = await PdfResources.lookup(resources, "Font", "F2", resolver);
  const opt = unwrapOk(result);
  expect(opt.some).toBe(false);
});

test("TC-08: 空のリソース辞書に対する lookup", async () => {
  const resources = PdfResources.createEmpty();
  const resolver = createStubResolver(new Map());

  const result = await PdfResources.lookup(resources, "Font", "F1", resolver);
  const opt = unwrapOk(result);
  expect(opt.some).toBe(false);
});

test("TC-09: 非推奨キー /ProcSet の無視・スキップ", async () => {
  const resources = PdfResources.from(
    makeDict([
      [
        "ProcSet",
        {
          type: "array",
          elements: [
            { type: "name", value: "PDF" },
            { type: "name", value: "Text" },
          ],
        },
      ],
    ]),
  );
  const resolver = createStubResolver(new Map());

  const catResult = await PdfResources.getCategory(
    resources,
    "ProcSet",
    resolver,
  );
  const catOpt = unwrapOk(catResult);
  expect(catOpt.some).toBe(false);

  const lookupResult = await PdfResources.lookup(
    resources,
    "ProcSet",
    "0",
    resolver,
  );
  const lookupOpt = unwrapOk(lookupResult);
  expect(lookupOpt.some).toBe(false);
});

test("TC-10: hasCategory による存在判定（/ProcSet は常に false）", () => {
  const resources = PdfResources.from(
    makeDict([
      ["Font", makeDict()],
      [
        "ProcSet",
        {
          type: "array",
          elements: [{ type: "name", value: "PDF" }],
        },
      ],
    ]),
  );

  expect(PdfResources.hasCategory(resources, "Font")).toBe(true);
  expect(PdfResources.hasCategory(resources, "ProcSet")).toBe(false);
  expect(PdfResources.hasCategory(resources, "XObject")).toBe(false);
});

test("TC-11: 無効な間接参照（存在しないオブジェクト番号）のエラー伝播", async () => {
  const resources = PdfResources.from(
    makeDict([["Font", indirectRefValue(999, 0)]]),
  );
  const resolver = createStubResolver(new Map());

  const result = await PdfResources.lookup(resources, "Font", "F1", resolver);
  const err = unwrapErr(result);
  expect((err as unknown as { code: string }).code).toBe("OBJECT_NOT_FOUND");
});

test("TC-12: 循環間接参照の検出エラー伝播 (CIRCULAR_REFERENCE)", async () => {
  const resources = PdfResources.from(
    makeDict([["Font", indirectRefValue(10, 0)]]),
  );
  const circularError: PdfError = {
    code: "CIRCULAR_REFERENCE" as const,
    message: "Circular reference detected",
  } as unknown as PdfError;
  const resolver = createStubResolver(
    new Map([["10-0", { ok: false, error: circularError }]]),
  );

  const result = await PdfResources.lookup(resources, "Font", "F1", resolver);
  const err = unwrapErr(result);
  expect((err as unknown as { code: string }).code).toBe("CIRCULAR_REFERENCE");
});

test("TC-13: カテゴリ値が非辞書（整数・配列等）の場合の安全な無視", async () => {
  const resources = PdfResources.from(
    makeDict([["Font", { type: "integer", value: 42 }]]),
  );
  const resolver = createStubResolver(new Map());

  const result = await PdfResources.lookup(resources, "Font", "F1", resolver);
  const opt = unwrapOk(result);
  expect(opt.some).toBe(false);
});

test("TC-15: カテゴリとエントリの2段階間接参照の同時解決", async () => {
  const fontDict = makeDict([["Type", { type: "name", value: "Font" }]]);
  const catDict = makeDict([["F1", indirectRefValue(3, 0)]]);
  const resources = PdfResources.from(
    makeDict([["Font", indirectRefValue(2, 0)]]),
  );
  const resolver = createStubResolver(
    new Map([
      ["2-0", catDict],
      ["3-0", fontDict],
    ]),
  );

  const result = await PdfResources.lookup(resources, "Font", "F1", resolver);
  const opt = unwrapOk(result);
  expect(opt.some).toBe(true);
  if (opt.some) {
    expect(opt.value).toBe(fontDict);
  }
});

test("TC-16: 未アクセスエントリの参照解決スキップ（オンデマンド解決の検証）", async () => {
  const font1 = makeDict([["Type", { type: "name", value: "Font" }]]);
  const resolvedRefs: string[] = [];
  const resources = PdfResources.from(
    makeDict([
      [
        "Font",
        makeDict([
          ["F1", indirectRefValue(1, 0)],
          ["F2", indirectRefValue(999, 0)],
        ]),
      ],
    ]),
  );
  const resolver = createStubResolver(new Map([["1-0", font1]]), (ref) => {
    resolvedRefs.push(`${ref.objectNumber}-${ref.generationNumber}`);
  });

  const result = await PdfResources.lookup(resources, "Font", "F1", resolver);
  const opt = unwrapOk(result);
  expect(opt.some).toBe(true);
  expect(resolvedRefs).toEqual(["1-0"]);
});

test("TC-17: カテゴリ間接参照の解決先が非辞書型の場合のフォールバック", async () => {
  const resources = PdfResources.from(
    makeDict([["Font", indirectRefValue(2, 0)]]),
  );
  const resolver = createStubResolver(
    new Map([["2-0", { type: "integer", value: 42 }]]),
  );

  const result = await PdfResources.lookup(resources, "Font", "F1", resolver);
  const opt = unwrapOk(result);
  expect(opt.some).toBe(false);
});

test("TC-18: 同一リソースに対する並行 lookup の競合安全性 (Promise.all)", async () => {
  const font1 = makeDict([["Name", { type: "name", value: "F1" }]]);
  const font2 = makeDict([["Name", { type: "name", value: "F2" }]]);
  const imageStream = makeStream(
    makeDict([["Subtype", { type: "name", value: "Image" }]]),
  );

  const resources = PdfResources.from(
    makeDict([
      [
        "Font",
        makeDict([
          ["F1", indirectRefValue(1, 0)],
          ["F2", indirectRefValue(2, 0)],
        ]),
      ],
      ["XObject", makeDict([["Im1", indirectRefValue(3, 0)]])],
    ]),
  );

  const resolver = createStubResolver(
    new Map<string, PdfObject>([
      ["1-0", font1],
      ["2-0", font2],
      ["3-0", imageStream],
    ]),
  );

  const [res1, res2, res3] = await Promise.all([
    PdfResources.lookup(resources, "Font", "F1", resolver),
    PdfResources.lookup(resources, "Font", "F2", resolver),
    PdfResources.lookup(resources, "XObject", "Im1", resolver),
  ]);

  expect(unwrapOk(res1).some).toBe(true);
  expect(unwrapOk(res2).some).toBe(true);
  expect(unwrapOk(res3).some).toBe(true);
});

test("TC-19: 同一入力に対する lookup のべき等性", async () => {
  const fontDict = makeDict();
  const resources = PdfResources.from(
    makeDict([["Font", makeDict([["F1", fontDict]])]]),
  );
  const resolver = createStubResolver(new Map());

  const first = await PdfResources.lookup(resources, "Font", "F1", resolver);
  const second = await PdfResources.lookup(resources, "Font", "F1", resolver);

  expect(unwrapOk(first)).toEqual(unwrapOk(second));
});

test("TC-22: 標準カテゴリ /ExtGState（グラフィックス状態辞書）の解決", async () => {
  const gsDict = makeDict([
    ["Type", { type: "name", value: "ExtGState" }],
    ["ca", { type: "real", value: 0.5 }],
  ]);
  const resources = PdfResources.from(
    makeDict([["ExtGState", makeDict([["GS1", gsDict]])]]),
  );
  const resolver = createStubResolver(new Map());

  const result = await PdfResources.lookup(
    resources,
    "ExtGState",
    "GS1",
    resolver,
  );
  const opt = unwrapOk(result);
  expect(opt.some).toBe(true);
  if (opt.some) {
    expect(opt.value).toBe(gsDict);
  }
});

test("TC-23: 標準カテゴリ /ColorSpace（色空間辞書・配列）の解決", async () => {
  const colorSpaceArray: PdfValue = {
    type: "array",
    elements: [{ type: "name", value: "ICCBased" }, indirectRefValue(7, 0)],
  };
  const resources = PdfResources.from(
    makeDict([["ColorSpace", makeDict([["CS1", indirectRefValue(6, 0)]])]]),
  );
  const resolver = createStubResolver(new Map([["6-0", colorSpaceArray]]));

  const result = await PdfResources.lookup(
    resources,
    "ColorSpace",
    "CS1",
    resolver,
  );
  const opt = unwrapOk(result);
  expect(opt.some).toBe(true);
  if (opt.some) {
    expect(opt.value).toBe(colorSpaceArray);
  }
});

test("TC-24: 標準カテゴリ /Pattern（タイリングパターンストリーム）の解決", async () => {
  const patternStream = makeStream(
    makeDict([
      ["Type", { type: "name", value: "Pattern" }],
      ["PatternType", { type: "integer", value: 1 }],
    ]),
  );
  const resources = PdfResources.from(
    makeDict([["Pattern", makeDict([["P1", indirectRefValue(8, 0)]])]]),
  );
  const resolver = createStubResolver(new Map([["8-0", patternStream]]));

  const result = await PdfResources.lookup(
    resources,
    "Pattern",
    "P1",
    resolver,
  );
  const opt = unwrapOk(result);
  expect(opt.some).toBe(true);
  if (opt.some) {
    expect(opt.value).toBe(patternStream);
  }
});

test("TC-25: 標準カテゴリ /Shading（シェーディング辞書）の解決", async () => {
  const shadingDict = makeDict([
    ["ShadingType", { type: "integer", value: 2 }],
  ]);
  const resources = PdfResources.from(
    makeDict([["Shading", makeDict([["Sh1", shadingDict]])]]),
  );
  const resolver = createStubResolver(new Map());

  const result = await PdfResources.lookup(
    resources,
    "Shading",
    "Sh1",
    resolver,
  );
  const opt = unwrapOk(result);
  expect(opt.some).toBe(true);
  if (opt.some) {
    expect(opt.value).toBe(shadingDict);
  }
});

test("TC-26: 標準カテゴリ /Properties（マークされたコンテンツのプロパティ）の解決", async () => {
  const propDict = makeDict([
    [
      "Title",
      { type: "string", value: new Uint8Array([72]), encoding: "literal" },
    ],
  ]);
  const resources = PdfResources.from(
    makeDict([["Properties", makeDict([["Prop1", indirectRefValue(9, 0)]])]]),
  );
  const resolver = createStubResolver(new Map([["9-0", propDict]]));

  const result = await PdfResources.lookup(
    resources,
    "Properties",
    "Prop1",
    resolver,
  );
  const opt = unwrapOk(result);
  expect(opt.some).toBe(true);
  if (opt.some) {
    expect(opt.value).toBe(propDict);
  }
});

test("TC-30: PdfResources.from の引数省略・undefined による空辞書初期化", () => {
  const fromUndefined = PdfResources.from(undefined);
  const fromOmitted = PdfResources.from();

  expect(fromUndefined.dictionary.entries.size).toBe(0);
  expect(fromOmitted.dictionary.entries.size).toBe(0);
});

test("TC-31: PdfResources.getCategory 単体での解決とフォールバック", async () => {
  const fontCat = makeDict([["F1", makeDict()]]);
  const resources = PdfResources.from(
    makeDict([
      ["Font", indirectRefValue(2, 0)],
      ["XObject", { type: "integer", value: 42 }],
    ]),
  );
  const resolver = createStubResolver(new Map([["2-0", fontCat]]));

  const fontRes = await PdfResources.getCategory(resources, "Font", resolver);
  const fontOpt = unwrapOk(fontRes);
  expect(fontOpt.some).toBe(true);
  if (fontOpt.some) {
    expect(fontOpt.value).toBe(fontCat);
  }

  const xobjectRes = await PdfResources.getCategory(
    resources,
    "XObject",
    resolver,
  );
  const xobjectOpt = unwrapOk(xobjectRes);
  expect(xobjectOpt.some).toBe(false);

  const procSetRes = await PdfResources.getCategory(
    resources,
    "ProcSet",
    resolver,
  );
  const procSetOpt = unwrapOk(procSetRes);
  expect(procSetOpt.some).toBe(false);
});

test("TC-32: 空カテゴリ辞書に対する lookup の安全な終了", async () => {
  const resources = PdfResources.from(makeDict([["Font", makeDict()]]));
  const resolver = createStubResolver(new Map());

  const result = await PdfResources.lookup(resources, "Font", "F1", resolver);
  const opt = unwrapOk(result);
  expect(opt.some).toBe(false);
});

test("TC-33: エントリ値が直接プリミティブオブジェクトの場合の透過的解決", async () => {
  const nameVal: PdfValue = { type: "name", value: "Title" };
  const resources = PdfResources.from(
    makeDict([["Properties", makeDict([["Tag", nameVal]])]]),
  );
  const resolver = createStubResolver(new Map());

  const result = await PdfResources.lookup(
    resources,
    "Properties",
    "Tag",
    resolver,
  );
  const opt = unwrapOk(result);
  expect(opt.some).toBe(true);
  if (opt.some) {
    expect(opt.value).toBe(nameVal);
  }
});

test("TC-34: リソース名に特殊文字・エスケープが含まれる場合の lookup", async () => {
  const fontDict = makeDict();
  const resources = PdfResources.from(
    makeDict([["Font", makeDict([["F#201", fontDict]])]]),
  );
  const resolver = createStubResolver(new Map());

  const result = await PdfResources.lookup(
    resources,
    "Font",
    "F#201",
    resolver,
  );
  const opt = unwrapOk(result);
  expect(opt.some).toBe(true);
  if (opt.some) {
    expect(opt.value).toBe(fontDict);
  }
});

test("TC-35: エントリ間接参照の先が null オブジェクトの場合の返却", async () => {
  const nullObj: PdfObject = { type: "null" };
  const resources = PdfResources.from(
    makeDict([["Font", makeDict([["F1", indirectRefValue(10, 0)]])]]),
  );
  const resolver = createStubResolver(new Map([["10-0", nullObj]]));

  const result = await PdfResources.lookup(resources, "Font", "F1", resolver);
  const opt = unwrapOk(result);
  expect(opt.some).toBe(true);
  if (opt.some) {
    expect(opt.value).toEqual({ type: "null" });
  }
});

test("TC-36: エントリレベルでの間接参照先不在エラーの伝播", async () => {
  const catDict = makeDict([["F1", indirectRefValue(999, 0)]]);
  const resources = PdfResources.from(
    makeDict([["Font", indirectRefValue(2, 0)]]),
  );
  const resolver = createStubResolver(new Map([["2-0", catDict]]));

  const result = await PdfResources.lookup(resources, "Font", "F1", resolver);
  const err = unwrapErr(result);
  expect((err as unknown as { code: string }).code).toBe("OBJECT_NOT_FOUND");
});

test("TC-37: 大規模リソース辞書（100+エントリ）でのオンデマンド lookup の性能・安全確認", async () => {
  const largeEntries: [string, PdfValue][] = [];
  const store = new Map<string, PdfObject>();
  for (let i = 1; i <= 100; i++) {
    largeEntries.push([`F${i}`, indirectRefValue(100 + i, 0)]);
    store.set(
      `${100 + i}-0`,
      makeDict([["ID", { type: "integer", value: i }]]),
    );
  }
  const resources = PdfResources.from(
    makeDict([["Font", makeDict(largeEntries)]]),
  );
  const resolvedList: string[] = [];
  const resolver = createStubResolver(store, (ref) => {
    resolvedList.push(`${ref.objectNumber}-${ref.generationNumber}`);
  });

  const result = await PdfResources.lookup(resources, "Font", "F50", resolver);
  const opt = unwrapOk(result);
  expect(opt.some).toBe(true);
  expect(resolvedList).toEqual(["150-0"]);
});
