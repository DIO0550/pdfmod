import { expect, test } from "vitest";
import {
  ByteOffset,
  CatalogParser,
  ContentStreamInterpreter,
  ContentStreamTokenizer,
  DocumentInfoParser,
  GenerationNumber,
  GraphicsState,
  GraphicsStateStack,
  InheritanceResolver,
  LRUCache,
  ObjectNumber,
  ObjectParser,
  ObjectStore,
  ObjectStreamBody,
  ObjectStreamHeader,
  OperandStack,
  Operator,
  type OperatorHandler,
  OperatorRegistry,
  PageTreeWalker,
  PdfDocument,
  PdfPage,
  PdfTrapped,
  PdfVersion,
  parseTrailer,
  parseXRefTable,
  Result,
  StringArrayEx,
  scanFallback,
  scanStartXRef,
  Tokenizer,
  TokenType,
} from "../index";

test.each([
  {
    name: "ContentStreamInterpreter.execute",
    value: ContentStreamInterpreter.execute,
  },
  { name: "ContentStreamTokenizer", value: ContentStreamTokenizer },
  { name: "GraphicsState.create", value: GraphicsState.create },
  { name: "GraphicsState.update", value: GraphicsState.update },
  { name: "GraphicsStateStack.create", value: GraphicsStateStack.create },
  { name: "OperandStack.create", value: OperandStack.create },
  { name: "OperatorRegistry.create", value: OperatorRegistry.create },
  { name: "Tokenizer", value: Tokenizer },
  { name: "LRUCache.create", value: LRUCache.create },
  { name: "scanStartXRef", value: scanStartXRef },
  { name: "scanFallback", value: scanFallback },
  { name: "parseXRefTable", value: parseXRefTable },
  { name: "parseTrailer", value: parseTrailer },
  { name: "ObjectParser.parse", value: ObjectParser.parse },
  {
    name: "ObjectParser.parseIndirectObject",
    value: ObjectParser.parseIndirectObject,
  },
  { name: "ObjectStore.create", value: ObjectStore.create },
  { name: "ObjectStreamBody.extract", value: ObjectStreamBody.extract },
  { name: "ObjectStreamHeader.parse", value: ObjectStreamHeader.parse },
  { name: "CatalogParser.parse", value: CatalogParser.parse },
  { name: "PageTreeWalker.walk", value: PageTreeWalker.walk },
  { name: "InheritanceResolver.resolve", value: InheritanceResolver.resolve },
  { name: "DocumentInfoParser.parse", value: DocumentInfoParser.parse },
  { name: "PdfTrapped.create", value: PdfTrapped.create },
  { name: "PdfPage.from", value: PdfPage.from },
  { name: "PdfDocument.load", value: PdfDocument.load },
])("$nameがルートからexportされている", ({ value }) => {
  expect(typeof value).toBe("function");
});

test("PdfVersionコンパニオンがルートからexportされている", () => {
  expect(PdfVersion.create("1.7").ok).toBe(true);
  expect(PdfVersion.create("bogus").ok).toBe(false);
});

test("ObjectNumberコンパニオンがルートからexportされている", () => {
  expect(ObjectNumber.of(1)).toBe(1);
  expect(ObjectNumber.create(0).ok).toBe(true);
});

test("GenerationNumberコンパニオンがルートからexportされている", () => {
  expect(GenerationNumber.of(0)).toBe(0);
  expect(GenerationNumber.create(0).ok).toBe(true);
});

test("ByteOffsetコンパニオンがルートからexportされている", () => {
  expect(ByteOffset.of(100)).toBe(100);
  expect(ByteOffset.create(0).ok).toBe(true);
  expect(ByteOffset.add(ByteOffset.of(10), ByteOffset.of(20))).toBe(30);
});

test("TokenType enumがルートからexportされている", () => {
  expect(TokenType.Integer).toBeDefined();
  expect(TokenType.EOF).toBeDefined();
  expect(TokenType.Operator).toBeDefined();
});

test("Operatorコンパニオンがルートからexportされている", () => {
  const op = Operator.of("m", ByteOffset.of(42));
  expect(op.type).toBe(TokenType.Operator);
  expect(op.name).toBe("m");
  expect(op.offset).toBe(42);
});

test("OperatorRegistry.registerでルート公開済みのAPIだけからoperatorを拡張できる", () => {
  const handler: OperatorHandler = (context) => Result.ok(context);
  const registry = OperatorRegistry.create();
  const result = OperatorRegistry.register(registry, "m", handler);
  const updated = Result.unwrapOr(result, registry);

  expect(result.ok).toBe(true);
  expect(updated).not.toBe(registry);
  expect(OperatorRegistry.lookup(updated, "m")).toEqual({
    some: true,
    value: handler,
  });
});

test("StringArrayExがルートからexportされている", () => {
  // firstMissing / containsAll / allMissing の 3 メソッドが root から
  // 取り出せることを確認。runtime 露出の回帰防止。
  expect(typeof StringArrayEx.firstMissing).toBe("function");
  expect(typeof StringArrayEx.containsAll).toBe("function");
  expect(typeof StringArrayEx.allMissing).toBe("function");
});
