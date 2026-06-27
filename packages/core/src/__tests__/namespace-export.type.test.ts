import { expect, test } from "vitest";
import type {
  ContentStreamInterpreterExecuteOptions,
  ContentStreamInterpreterResult,
  InheritedAttrs,
  LoadOptions,
  OperatorHandlerContext,
  ParsedCatalog,
  PdfDocumentLoadError,
  PdfPageRectangle,
  ResolvedPage,
  ResolveRef,
  WalkPageTreeResult,
} from "../index";
import {
  ContentStreamInterpreter,
  ContentStreamTokenizer,
  GraphicsState,
  OperatorRegistry,
  Option,
  PdfVersion,
  Result,
  StringArrayEx,
} from "../index";

test("Result.okがランタイムで動作する", () => {
  const result = Result.ok(42);
  expect(result).toEqual({ ok: true, value: 42 });
});

test("Result.errがランタイムで動作する", () => {
  const result = Result.err("fail");
  expect(result).toEqual({ ok: false, error: "fail" });
});

test("Result.mapがランタイムで動作する", () => {
  const result = Result.map(Result.ok(2), (x) => x * 3);
  expect(result).toEqual({ ok: true, value: 6 });
});

test("Option.someがランタイムで動作する", () => {
  const result = Option.some(42);
  expect(result).toEqual({ some: true, value: 42 });
});

test("Option.noneがランタイムで動作する", () => {
  expect(Option.none).toEqual({ some: false });
});

test("Option.mapがランタイムで動作する", () => {
  const result = Option.map(Option.some(2), (x) => x * 3);
  expect(result).toEqual({ some: true, value: 6 });
});

test("Result.Result型が参照できる", () => {
  const r: Result.Result<number, string> = Result.ok(42);
  expect(r.ok).toBe(true);
});

test("Option.Option型が参照できる", () => {
  const o: Option.Option<number> = Option.some(42);
  expect(o.some).toBe(true);
});

test("GraphicsState型とコンパニオンがルートから参照できる", () => {
  const state: GraphicsState = GraphicsState.create();
  expect(typeof state.lineWidth).toBe("number");
});

test("ContentStreamTokenizerがルートから参照できる", () => {
  const tokenizer = new ContentStreamTokenizer(new Uint8Array());
  expect(tokenizer.position).toBe(0);
});

test("ContentStreamInterpreter型とコンパニオンがルートから参照できる", () => {
  const options: ContentStreamInterpreterExecuteOptions = {
    data: new Uint8Array(),
    registry: OperatorRegistry.create(),
  };
  const result = ContentStreamInterpreter.execute(options);
  const value = {} as ContentStreamInterpreterResult;
  const context = {} as OperatorHandlerContext;

  expect(result.ok).toBe(true);
  expect(value).toBeDefined();
  expect(context).toBeDefined();
});

test("ParsedCatalog型とResolveRef型が参照できる", () => {
  const versionResult = PdfVersion.create("1.7");
  expect(versionResult.ok).toBe(true);
  const version = (
    versionResult as {
      ok: true;
      value: ReturnType<typeof PdfVersion.create> extends {
        ok: true;
        value: infer V;
      }
        ? V
        : never;
    }
  ).value;
  const parsed: ParsedCatalog = {
    catalog: { type: "dictionary", entries: new Map() },
    pagesRef: {
      objectNumber: 2 as ParsedCatalog["pagesRef"]["objectNumber"],
      generationNumber: 0 as ParsedCatalog["pagesRef"]["generationNumber"],
    },
    version,
  };
  const resolver: ResolveRef = async () => Result.ok({ type: "null" as const });
  expect(parsed.version).toBe(version);
  expect(typeof resolver).toBe("function");
});

test("PdfPageRectangle 型がルートから参照できる", () => {
  const rect: PdfPageRectangle = [0, 0, 612, 792];
  expect(rect[2]).toBe(612);
  expect(rect[3]).toBe(792);
});

test("ResolvedPage / InheritedAttrs / WalkPageTreeResult 型が参照できる", () => {
  const page: ResolvedPage = {
    mediaBox: [0, 0, 612, 792],
    resources: { type: "dictionary", entries: new Map() },
    cropBox: [0, 0, 612, 792],
    rotate: 0,
    contents: null,
    annots: null,
    userUnit: 1.0,
    objectRef: {
      objectNumber: 2 as ResolvedPage["objectRef"]["objectNumber"],
      generationNumber: 0 as ResolvedPage["objectRef"]["generationNumber"],
    },
  };
  const inh: InheritedAttrs = { mediaBox: [0, 0, 612, 792] };
  const res: WalkPageTreeResult = { pages: [page], warnings: [] };
  expect(res.pages.length).toBe(1);
  expect(inh.mediaBox?.[2]).toBe(612);
});

test("LoadOptions 型がルートから参照できる", () => {
  const options: LoadOptions = {
    cacheCapacity: 16,
    onWarning: () => {},
  };
  expect(options.cacheCapacity).toBe(16);
  expect(typeof options.onWarning).toBe("function");
});

test("PdfDocumentLoadError 型がルートから参照できる", () => {
  const error: PdfDocumentLoadError = new RangeError("cacheCapacity");
  expect(error.message).toBe("cacheCapacity");
});

// IsExact: 型 A と B が完全一致するかをコンパイル時に判定するヘルパー。
// 代入可能性ではなく型の完全一致を見るため、Option<string> から
// Option<"Width" | "Height"> 等の narrower な型への変化も検出できる。
type IsExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;
type Assert<T extends true> = T;

test("StringArrayEx.firstMissingがrequiredKeysの要素型にnarrowされたOption<K>を返す", () => {
  // firstMissing は <K extends string> でジェネリック化されており、
  // requiredKeys の要素型 K に narrow された Option<K> を返す。
  // 呼び出し側がリテラル union を持つ as const 配列を渡せば cast 依存なしで
  // narrow された missing キーが得られる（handler 側の二重ロック型整合に利用）。
  const missing = StringArrayEx.firstMissing(
    ["Width"] as const,
    ["Width", "Height"] as const,
  );
  // 型アサーションを値に落とすことで lint で「未使用型」と検出されないようにし、
  // 同時にコンパイル時の型一致検証とランタイム expect の両方を兼ねる。
  const returnTypeIsExactlyOptionNarrowed: Assert<
    IsExact<typeof missing, Option.Option<"Width" | "Height">>
  > = true;
  expect(returnTypeIsExactlyOptionNarrowed).toBe(true);
  expect(missing).toEqual(Option.some("Height"));
});
