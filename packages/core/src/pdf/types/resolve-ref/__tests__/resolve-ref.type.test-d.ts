import { expectTypeOf, test } from "vitest";
import type { Result } from "../../../../utils/result/index";
import type { PdfError } from "../../../errors/index";
import type { IndirectRef } from "../../indirect-ref/index";
import type { PdfObject } from "../../pdf-types/index";
import type { ResolveRef } from "../index";

test("ResolveRef は IndirectRef を受け取り Promise<Result<PdfObject, PdfError>> を返す関数型である", () => {
  expectTypeOf<ResolveRef>().toBeFunction();
  expectTypeOf<ResolveRef>().parameters.toEqualTypeOf<[IndirectRef]>();
  expectTypeOf<ResolveRef>().returns.toEqualTypeOf<
    Promise<Result<PdfObject, PdfError>>
  >();
});
