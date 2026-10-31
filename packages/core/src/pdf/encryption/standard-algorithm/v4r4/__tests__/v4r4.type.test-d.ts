import { expectTypeOf, test } from "vitest";
import type {
  EncryptError,
  Result,
  StandardAlgorithm,
  V1R2,
  V4R4,
} from "../../../../../index";

test("V4R4 の生成結果は別の方式へ広がらない", () => {
  expectTypeOf<ReturnType<typeof V4R4.fromDictionary>>().toEqualTypeOf<
    Result.Result<V4R4, EncryptError>
  >();

  expectTypeOf<V4R4>().toEqualTypeOf<
    Extract<StandardAlgorithm, { kind: "V4R4" }>
  >();

  expectTypeOf<V4R4>().not.toExtend<V1R2>();
});
