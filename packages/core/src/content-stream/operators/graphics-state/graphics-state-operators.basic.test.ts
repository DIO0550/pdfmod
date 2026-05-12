import { assert, expect, test } from "vitest";
import { OperatorRegistry } from "../../operator-registry/index";
import { registerGraphicsStateOperators } from "./graphics-state-operators";

test.each([
  ["cm"],
  ["w"],
  ["J"],
  ["j"],
  ["M"],
])("registerGraphicsStateOperators は %s を登録する", (name) => {
  const result = registerGraphicsStateOperators(OperatorRegistry.create());
  assert(result.ok);
  expect(OperatorRegistry.has(result.value, name)).toBe(true);
});
