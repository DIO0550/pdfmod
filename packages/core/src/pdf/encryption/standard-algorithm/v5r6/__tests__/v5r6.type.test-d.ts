import { expectTypeOf, test } from "vitest";
import type {
  EncryptError,
  Result,
  StandardAlgorithm,
  V5R5,
  V5R6,
} from "../../../../../index";

test("V5R6 の生成結果は別の方式へ広がらない", () => {
  expectTypeOf<ReturnType<typeof V5R6.fromDictionary>>().toEqualTypeOf<
    Result.Result<V5R6, EncryptError>
  >();

  expectTypeOf<V5R6>().toEqualTypeOf<
    Extract<StandardAlgorithm, { kind: "V5R6" }>
  >();

  expectTypeOf<V5R6>().not.toExtend<V5R5>();
});
