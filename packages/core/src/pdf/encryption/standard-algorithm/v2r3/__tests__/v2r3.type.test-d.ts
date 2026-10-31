import { expectTypeOf, test } from "vitest";
import type {
  EncryptError,
  Result,
  StandardAlgorithm,
  V1R2,
  V2R3,
} from "../../../../../index";

test("V2R3 の生成結果は別の方式へ広がらない", () => {
  expectTypeOf<ReturnType<typeof V2R3.fromDictionary>>().toEqualTypeOf<
    Result.Result<V2R3, EncryptError>
  >();

  expectTypeOf<V2R3>().toEqualTypeOf<
    Extract<StandardAlgorithm, { kind: "V2R3" }>
  >();

  expectTypeOf<V2R3>().not.toExtend<V1R2>();
});
