import { assert, expect, test } from "vitest";
import {
  type OperatorHandler,
  OperatorRegistry,
} from "../../../../operator-registry/index";
import {
  btHandler,
  etHandler,
  registerTextStateOperators,
  tcHandler,
  tfHandler,
  tlHandler,
  trHandler,
  tsHandler,
  twHandler,
  tzHandler,
} from "../index";

test.each<readonly [string, OperatorHandler]>([
  ["BT", btHandler],
  ["ET", etHandler],
  ["Tf", tfHandler],
  ["Tc", tcHandler],
  ["Tw", twHandler],
  ["Tz", tzHandler],
  ["TL", tlHandler],
  ["Tr", trHandler],
  ["Ts", tsHandler],
])("registerTextStateOperators は %s に対応する handler を登録する", (name, expectedHandler) => {
  const result = registerTextStateOperators(OperatorRegistry.create());
  assert(result.ok);

  const looked = OperatorRegistry.lookup(result.value, name);
  assert(looked.some);
  expect(looked.value).toBe(expectedHandler);
});

test("registerTextStateOperators の戻り値は ok で 9 operator すべてを保持する registry を返す", () => {
  const result = registerTextStateOperators(OperatorRegistry.create());
  assert(result.ok);

  expect(OperatorRegistry.has(result.value, "BT")).toBe(true);
  expect(OperatorRegistry.has(result.value, "ET")).toBe(true);
  expect(OperatorRegistry.has(result.value, "Tf")).toBe(true);
  expect(OperatorRegistry.has(result.value, "Tc")).toBe(true);
  expect(OperatorRegistry.has(result.value, "Tw")).toBe(true);
  expect(OperatorRegistry.has(result.value, "Tz")).toBe(true);
  expect(OperatorRegistry.has(result.value, "TL")).toBe(true);
  expect(OperatorRegistry.has(result.value, "Tr")).toBe(true);
  expect(OperatorRegistry.has(result.value, "Ts")).toBe(true);
});
