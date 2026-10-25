import { assertType, expectTypeOf, test } from "vitest";
import type { PdfError } from "../../../pdf/errors/index";
import type {
  PdfDictionary,
  PdfObject,
  ResolveRef,
} from "../../../pdf/types/index";
import type { Option } from "../../../utils/option/index";
import type { Result } from "../../../utils/result/index";
import {
  PDF_RESOURCE_CATEGORIES,
  type PdfResourceCategory,
  PdfResources,
} from "../index";

test("PdfResources インターフェースの読み取り専用性（readonly 制約）", () => {
  const resources: PdfResources = PdfResources.createEmpty();
  expectTypeOf(resources.dictionary).toEqualTypeOf<PdfDictionary>();
  // @ts-expect-error dictionary is readonly
  resources.dictionary = {} as PdfDictionary;
});

test("PDF_RESOURCE_CATEGORIES 配列と PdfResourceCategory 型の厳密な一致", () => {
  expectTypeOf<PdfResourceCategory>().toEqualTypeOf<
    | "ExtGState"
    | "ColorSpace"
    | "Pattern"
    | "Shading"
    | "XObject"
    | "Font"
    | "Properties"
  >();

  const firstCat: PdfResourceCategory = PDF_RESOURCE_CATEGORIES[0];
  assertType<PdfResourceCategory>(firstCat);

  // @ts-expect-error invalid category is not assignable to PdfResourceCategory
  const _invalidCat: PdfResourceCategory = "InvalidCategory";
});

test("PdfResources.lookup の戻り値型の推論チェック", () => {
  const resources: PdfResources = PdfResources.createEmpty();
  const resolveRef: ResolveRef = {} as ResolveRef;

  expectTypeOf(
    PdfResources.lookup(resources, "Font", "F1", resolveRef),
  ).toEqualTypeOf<Promise<Result<Option<PdfObject>, PdfError>>>();

  expectTypeOf(
    PdfResources.getCategory(resources, "Font", resolveRef),
  ).toEqualTypeOf<Promise<Result<Option<PdfDictionary>, PdfError>>>();

  expectTypeOf(
    PdfResources.hasCategory(resources, "Font"),
  ).toEqualTypeOf<boolean>();
});
