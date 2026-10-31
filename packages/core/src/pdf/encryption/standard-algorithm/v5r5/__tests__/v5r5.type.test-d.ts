import { expectTypeOf, test } from "vitest";
import type {
  EncryptError,
  Result,
  StandardAlgorithm,
  V5R5,
  V5R6,
} from "../../../../../index";

test("V5R5 の生成結果は別の方式へ広がらない", () => {
  expectTypeOf<ReturnType<typeof V5R5.fromDictionary>>().toEqualTypeOf<
    Result.Result<V5R5, EncryptError>
  >();

  expectTypeOf<V5R5>().toEqualTypeOf<
    Extract<StandardAlgorithm, { kind: "V5R5" }>
  >();

  expectTypeOf<V5R5>().not.toExtend<V5R6>();
});
