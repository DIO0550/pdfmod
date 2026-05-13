import { assert, expect, test } from "vitest";
import { OperatorRegistry } from "../../../../operator-registry/index";
import {
  cmHandler,
  lineWidthHandler,
  registerGraphicsStateOperators,
} from "../../graphics-state-operators";

test("cm が登録済みなら OPERATOR_ALREADY_REGISTERED の Err を返し operatorName が cm", () => {
  const seed = OperatorRegistry.register(
    OperatorRegistry.create(),
    "cm",
    cmHandler,
  );
  assert(seed.ok);

  const result = registerGraphicsStateOperators(seed.value);

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_ALREADY_REGISTERED");
  assert(result.error.code === "OPERATOR_ALREADY_REGISTERED");
  expect(result.error.operatorName).toBe("cm");
});

test("cm と w が事前登録済みでも 最初の重複 cm の Err が返る (fail-fast 短絡)", () => {
  const withCm = OperatorRegistry.register(
    OperatorRegistry.create(),
    "cm",
    cmHandler,
  );
  assert(withCm.ok);
  const withCmAndW = OperatorRegistry.register(
    withCm.value,
    "w",
    lineWidthHandler,
  );
  assert(withCmAndW.ok);

  const result = registerGraphicsStateOperators(withCmAndW.value);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ALREADY_REGISTERED");
  expect(result.error.operatorName).toBe("cm");
});
