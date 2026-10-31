import { expectTypeOf, test } from "vitest";
import type { StandardAlgorithm, V1R2, V1R3 } from "../../../../../index";

test("V1R2 の生成結果は別の方式へ広がらない", () => {
  expectTypeOf<ReturnType<typeof V1R2.create>>().toEqualTypeOf<V1R2>();

  expectTypeOf<V1R2>().toEqualTypeOf<
    Extract<StandardAlgorithm, { kind: "V1R2" }>
  >();

  expectTypeOf<V1R2>().not.toExtend<V1R3>();
});
