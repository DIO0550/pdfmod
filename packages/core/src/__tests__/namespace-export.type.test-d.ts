// packages/core/src/__tests__/namespace-export.type.test-d.ts

import { expectTypeOf, test } from "vitest";
import type {
  ContentStreamInterpreterExecuteOptions,
  ContentStreamInterpreterResult,
  GraphicsStateStack,
  InheritedAttrs,
  LoadOptions,
  MarkedContentStack,
  OperandStack,
  OperatorHandlerContext,
  ParsedCatalog,
  PdfDictionary,
  PdfDocumentLoadError,
  PdfError,
  PdfPageRectangle,
  PdfRectangle,
  PdfVersion,
  PdfWarning,
  ResolvedPage,
  ResolveRef,
  WalkPageTreeResult,
} from "../index";
import {
  ContentStreamInterpreter,
  GraphicsState,
  Interop,
  Option,
  Result,
  StringArrayEx,
} from "../index";

test("Result.Result 型がルートから参照でき Ok と Err の union である", () => {
  expectTypeOf<Result.Result<number, string>>().toEqualTypeOf<
    Result.Ok<number> | Result.Err<string>
  >();
});

test("Option.Option 型がルートから参照でき Some と None の union である", () => {
  expectTypeOf<Option.Option<number>>().toEqualTypeOf<
    Option.Some<number> | Option.None
  >();
});

test("GraphicsState 型とコンパニオンがルートから参照できる", () => {
  expectTypeOf(GraphicsState.create).returns.toEqualTypeOf<GraphicsState>();
  expectTypeOf<GraphicsState["lineWidth"]>().toEqualTypeOf<number>();
});

test("ContentStreamInterpreter.execute の入力型がルートから参照できる", () => {
  expectTypeOf(ContentStreamInterpreter.execute)
    .parameter(0)
    .toEqualTypeOf<ContentStreamInterpreterExecuteOptions>();
  expectTypeOf<
    ContentStreamInterpreterExecuteOptions["data"]
  >().toEqualTypeOf<Uint8Array>();
});

test("ContentStreamInterpreter.execute は Result でラップした結果を返す", () => {
  expectTypeOf(ContentStreamInterpreter.execute).returns.toEqualTypeOf<
    Result.Result<ContentStreamInterpreterResult, PdfError>
  >();
  expectTypeOf<
    ContentStreamInterpreterResult["context"]
  >().toEqualTypeOf<OperatorHandlerContext>();
  expectTypeOf<ContentStreamInterpreterResult["warnings"]>().toEqualTypeOf<
    readonly PdfWarning[]
  >();
});

test("OperatorHandlerContext の3スタックがルートから参照できる", () => {
  expectTypeOf<
    OperatorHandlerContext["operandStack"]
  >().toEqualTypeOf<OperandStack>();
  expectTypeOf<
    OperatorHandlerContext["graphicsStateStack"]
  >().toEqualTypeOf<GraphicsStateStack>();
  expectTypeOf<
    OperatorHandlerContext["markedContentStack"]
  >().toEqualTypeOf<MarkedContentStack>();
});

test("ParsedCatalog 型がルートから参照できる", () => {
  expectTypeOf<ParsedCatalog["catalog"]>().toEqualTypeOf<PdfDictionary>();
  expectTypeOf<ParsedCatalog["version"]>().toEqualTypeOf<PdfVersion>();
  expectTypeOf<ParsedCatalog["warnings"]>().toEqualTypeOf<
    readonly PdfWarning[]
  >();
});

test("ResolveRef 型が IndirectRef を非同期解決する関数型である", () => {
  expectTypeOf<ResolveRef>().toBeFunction();
  expectTypeOf<ReturnType<ResolveRef>>().toExtend<Promise<unknown>>();
});

test("PdfPageRectangle が readonly な4要素タプルである", () => {
  expectTypeOf<PdfPageRectangle>().toEqualTypeOf<
    readonly [number, number, number, number]
  >();
});

test("ResolvedPage の矩形は mutable な PdfRectangle である", () => {
  // PdfPageRectangle（readonly 版、PdfPage が公開）とは別名・別定義なので取り違えない。
  expectTypeOf<ResolvedPage["mediaBox"]>().toEqualTypeOf<PdfRectangle>();
  expectTypeOf<ResolvedPage["cropBox"]>().toEqualTypeOf<PdfRectangle>();
  expectTypeOf<PdfRectangle>().toEqualTypeOf<
    [number, number, number, number]
  >();
  expectTypeOf<ResolvedPage["userUnit"]>().toEqualTypeOf<number>();
});

test("InheritedAttrs の全フィールドが省略可能である", () => {
  expectTypeOf<InheritedAttrs["mediaBox"]>().toEqualTypeOf<
    PdfRectangle | undefined
  >();
  expectTypeOf<InheritedAttrs["resources"]>().toEqualTypeOf<
    PdfDictionary | undefined
  >();
  expectTypeOf<InheritedAttrs["rotate"]>().toEqualTypeOf<number | undefined>();
});

test("WalkPageTreeResult 型がルートから参照できる", () => {
  expectTypeOf<WalkPageTreeResult["pages"]>().toEqualTypeOf<ResolvedPage[]>();
  expectTypeOf<WalkPageTreeResult["warnings"]>().toEqualTypeOf<PdfWarning[]>();
});

test("LoadOptions 型がルートから参照でき全フィールドが省略可能である", () => {
  expectTypeOf<LoadOptions["cacheCapacity"]>().toEqualTypeOf<
    number | undefined
  >();
  expectTypeOf<LoadOptions["onWarning"]>().toEqualTypeOf<
    ((warning: PdfWarning) => void) | undefined
  >();
});

test("PdfDocumentLoadError は PdfError と RangeError の union である", () => {
  expectTypeOf<PdfDocumentLoadError>().toEqualTypeOf<PdfError | RangeError>();
});

test("StringArrayEx.firstMissing は requiredKeys の要素型に narrow された Option を返す", () => {
  // requiredKeys にリテラル union の as const 配列を渡すと、戻り値が
  // Option<string> ではなく Option<"Width" | "Height"> に narrow されることを検証する。
  // 代入可能性ではなく完全一致を見るため toEqualTypeOf を使う。
  const missing = StringArrayEx.firstMissing(
    ["Width"] as const,
    ["Width", "Height"] as const,
  );
  expectTypeOf(missing).toEqualTypeOf<Option.Option<"Width" | "Height">>();
});

test("ルート経由の Interop.toOption の戻り値型が Option<T> に完全一致する", () => {
  // utils/interop/__tests__/interop.type.test.ts:50-58 は内部モジュール直参照での検証。
  // こちらは `export * as Interop` がジェネリック署名を保って再エクスポートしていることを見る。
  const converted = Interop.toOption(Result.ok(42));
  expectTypeOf(converted).toEqualTypeOf<Option.Option<number>>();
});

test("Result.toOption が公開 API から削除されている", () => {
  expectTypeOf(Result).not.toHaveProperty("toOption");
});

test("Option.fromResult が公開 API から削除されている", () => {
  expectTypeOf(Option).not.toHaveProperty("fromResult");
});

test("Option.toResult が公開 API から削除されている", () => {
  expectTypeOf(Option).not.toHaveProperty("toResult");
});
